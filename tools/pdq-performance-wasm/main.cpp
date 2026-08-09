#include <pdq/cpp/common/pdqhashtypes.h>
#include <pdq/cpp/hashing/pdqhashing.h>

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <limits>

namespace {

constexpr int kMinimumDimension = 5;
constexpr std::size_t kMaximumInputBytes = 64U * 1024U * 1024U;

} // namespace

extern "C" {

int pdq_hash_rgb(
    uint8_t* input,
    int width,
    int height,
    uint16_t* hash_words) {
  if (input == nullptr || hash_words == nullptr || width < kMinimumDimension ||
      height < kMinimumDimension || width > std::numeric_limits<int>::max() / 3) {
    return -1;
  }
  const std::size_t maximum_pixel_count = kMaximumInputBytes / 3U;
  if (static_cast<std::size_t>(width) >
      maximum_pixel_count / static_cast<std::size_t>(height)) {
    return -2;
  }
  const std::size_t pixel_count =
      static_cast<std::size_t>(width) * static_cast<std::size_t>(height);

  float* full_buffer_1 = static_cast<float*>(std::malloc(pixel_count * sizeof(float)));
  float* full_buffer_2 = static_cast<float*>(std::malloc(pixel_count * sizeof(float)));
  if (full_buffer_1 == nullptr || full_buffer_2 == nullptr) {
    std::free(full_buffer_1);
    std::free(full_buffer_2);
    return -3;
  }

  facebook::pdq::hashing::fillFloatLumaFromRGB(
      input,
      input + 1,
      input + 2,
      height,
      width,
      width * 3,
      3,
      full_buffer_1);

  float buffer_64x64[64][64];
  float buffer_16x64[16][64];
  float buffer_16x16[16][16];
  facebook::pdq::hashing::Hash256 hash;
  int quality = 0;
  facebook::pdq::hashing::pdqHash256FromFloatLuma(
      full_buffer_1,
      full_buffer_2,
      height,
      width,
      buffer_64x64,
      buffer_16x64,
      buffer_16x16,
      hash,
      quality);

  for (int index = 0; index < facebook::pdq::hashing::HASH256_NUM_WORDS; index++) {
    hash_words[index] = hash.w[index];
  }
  std::free(full_buffer_1);
  std::free(full_buffer_2);
  return quality;
}

} // extern "C"
