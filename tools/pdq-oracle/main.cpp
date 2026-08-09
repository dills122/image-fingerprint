#include <pdq/cpp/common/pdqhashtypes.h>
#include <pdq/cpp/hashing/pdqhashing.h>
#include <pdq/cpp/hashing/torben.h>

#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr int kMinimumDimension = 5;
constexpr std::size_t kMaximumInputBytes = 64U * 1024U * 1024U;
constexpr uint32_t kMaximumBatchRequests = 100000U;
constexpr char kBatchMagic[] = "PDQB001";
constexpr const char* kReferenceRepository =
    "https://github.com/facebook/ThreatExchange.git";
constexpr const char* kReferenceCommit =
    "baefb4ed67b6cdc1d4c82dbaef858d50866ac424";

int parseDimension(const char* text, const char* name) {
  std::size_t parsed = 0;
  long long value = 0;
  try {
    value = std::stoll(text, &parsed, 10);
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string(name) + " must be an integer");
  }

  if (parsed != std::string(text).size() || value < kMinimumDimension ||
      value > std::numeric_limits<int>::max()) {
    throw std::invalid_argument(
        std::string(name) + " must be an integer between 5 and INT_MAX");
  }
  return static_cast<int>(value);
}

std::size_t checkedProduct(
    std::size_t left,
    std::size_t right,
    const char* description) {
  if (right != 0 && left > std::numeric_limits<std::size_t>::max() / right) {
    throw std::overflow_error(std::string(description) + " is too large");
  }
  return left * right;
}

uint32_t floatBits(float value) {
  uint32_t bits = 0;
  static_assert(sizeof(bits) == sizeof(value), "float must be 32 bits");
  std::memcpy(&bits, &value, sizeof(bits));
  return bits;
}

void writeFloatBits(const float* values, std::size_t length) {
  std::cout << '[';
  for (std::size_t index = 0; index < length; index++) {
    if (index != 0) {
      std::cout << ',';
    }
    std::cout << floatBits(values[index]);
  }
  std::cout << ']';
}

std::size_t expectedInputBytes(
    const std::string& format,
    int width,
    int height) {
  const std::size_t pixelCount = checkedProduct(
      static_cast<std::size_t>(width),
      static_cast<std::size_t>(height),
      "pixel count");
  const std::size_t channelCount = format == "gray8" ? 1U : 3U;
  const std::size_t expectedBytes = checkedProduct(
      pixelCount,
      channelCount,
      "input byte count");
  if (expectedBytes > kMaximumInputBytes) {
    throw std::length_error("input exceeds 67108864-byte limit");
  }
  if (format == "rgb8" && width > std::numeric_limits<int>::max() / 3) {
    throw std::overflow_error("RGB row stride is too large");
  }
  return expectedBytes;
}

void hashAndWriteResult(
    const std::string& format,
    int width,
    int height,
    std::vector<uint8_t>& input,
    bool diagnostics) {
  const std::size_t pixelCount = checkedProduct(
      static_cast<std::size_t>(width),
      static_cast<std::size_t>(height),
      "pixel count");
  std::vector<float> fullBuffer1(pixelCount);
  std::vector<float> fullBuffer2(pixelCount);
  if (format == "gray8") {
    facebook::pdq::hashing::fillFloatLumaFromGrey(
        input.data(),
        height,
        width,
        width,
        1,
        fullBuffer1.data());
  } else {
    const int rowStride = width * 3;
    uint8_t* base = input.data();
    facebook::pdq::hashing::fillFloatLumaFromRGB(
        base,
        base + 1,
        base + 2,
        height,
        width,
        rowStride,
        3,
        fullBuffer1.data());
  }
  std::vector<float> sourceLuma;
  if (diagnostics) {
    sourceLuma = fullBuffer1;
  }

  float buffer64x64[64][64];
  float buffer16x64[16][64];
  float buffer16x16[16][16];
  facebook::pdq::hashing::Hash256 hash;
  int quality = 0;
  facebook::pdq::hashing::pdqHash256FromFloatLuma(
      fullBuffer1.data(),
      fullBuffer2.data(),
      height,
      width,
      buffer64x64,
      buffer16x64,
      buffer16x16,
      hash,
      quality);

  if (diagnostics) {
    const float median = facebook::pdq::hashing::torben(
        &buffer16x16[0][0],
        16 * 16);
    std::cout << "{\"lumaBits\":";
    writeFloatBits(sourceLuma.data(), sourceLuma.size());
    std::cout << ",\"downsampledBits\":";
    writeFloatBits(&buffer64x64[0][0], 64U * 64U);
    std::cout << ",\"dctIntermediateBits\":";
    writeFloatBits(&buffer16x64[0][0], 16U * 64U);
    std::cout << ",\"dctOutputBits\":";
    writeFloatBits(&buffer16x16[0][0], 16U * 16U);
    std::cout << ",\"medianBits\":" << floatBits(median)
              << ",\"hash\":\"" << hash.format()
              << "\",\"quality\":" << quality << "}\n";
  } else {
    std::cout << "{\"hash\":\"" << hash.format() << "\",\"quality\":"
              << quality << "}\n";
  }
}

void readBatchBytes(uint8_t* destination, std::size_t length, const char* label) {
  std::cin.read(
      reinterpret_cast<char*>(destination),
      static_cast<std::streamsize>(length));
  if (static_cast<std::size_t>(std::cin.gcount()) != length) {
    throw std::invalid_argument(
        std::string("truncated batch input while reading ") + label);
  }
}

uint32_t readBatchUint32(const char* label) {
  uint8_t bytes[4];
  readBatchBytes(bytes, sizeof(bytes), label);
  return static_cast<uint32_t>(bytes[0]) |
      (static_cast<uint32_t>(bytes[1]) << 8U) |
      (static_cast<uint32_t>(bytes[2]) << 16U) |
      (static_cast<uint32_t>(bytes[3]) << 24U);
}

int batchDimension(uint32_t value, const char* name) {
  if (value < static_cast<uint32_t>(kMinimumDimension) ||
      value > static_cast<uint32_t>(std::numeric_limits<int>::max())) {
    throw std::invalid_argument(
        std::string(name) + " must be an integer between 5 and INT_MAX");
  }
  return static_cast<int>(value);
}

void runBatch() {
  uint8_t magic[sizeof(kBatchMagic) - 1U];
  readBatchBytes(magic, sizeof(magic), "magic");
  if (std::memcmp(magic, kBatchMagic, sizeof(magic)) != 0) {
    throw std::invalid_argument("invalid batch magic");
  }

  const uint32_t requestCount = readBatchUint32("request count");
  if (requestCount == 0 || requestCount > kMaximumBatchRequests) {
    throw std::invalid_argument("batch request count must be between 1 and 100000");
  }

  for (uint32_t index = 0; index < requestCount; index++) {
    uint8_t formatCode = 0;
    readBatchBytes(&formatCode, 1U, "request format");
    const std::string format = formatCode == 1U ? "gray8" : "rgb8";
    if (formatCode != 1U && formatCode != 2U) {
      throw std::invalid_argument("batch request format must be 1 or 2");
    }
    const int width = batchDimension(readBatchUint32("request width"), "width");
    const int height = batchDimension(readBatchUint32("request height"), "height");
    const uint32_t declaredBytes = readBatchUint32("request byte length");
    const std::size_t expectedBytes = expectedInputBytes(format, width, height);
    if (declaredBytes != expectedBytes) {
      throw std::invalid_argument(
          "batch request declared " + std::to_string(declaredBytes) +
          " input bytes, expected " + std::to_string(expectedBytes));
    }

    std::vector<uint8_t> input(expectedBytes);
    readBatchBytes(input.data(), input.size(), "request pixels");
    hashAndWriteResult(format, width, height, input, false);
  }

  if (std::cin.peek() != std::char_traits<char>::eof()) {
    throw std::invalid_argument("batch input contains trailing bytes");
  }
}

} // namespace

int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--metadata") {
    std::cout << "{\"protocolVersion\":1,\"referenceRepository\":\""
              << kReferenceRepository << "\",\"referenceCommit\":\""
              << kReferenceCommit << "\"}\n";
    return 0;
  }

  std::cin.sync_with_stdio(false);
  if (argc == 2 && std::string(argv[1]) == "--batch") {
    try {
      runBatch();
      return 0;
    } catch (const std::exception& error) {
      std::cerr << "pdq-oracle: " << error.what() << "\n";
      return 2;
    }
  }

  const bool diagnostics = argc == 5 && std::string(argv[1]) == "--diagnostics";
  if ((!diagnostics && argc != 4) || (diagnostics && argc != 5)) {
    std::cerr
        << "Usage: pdq-oracle <gray8|rgb8> <width> <height> | "
           "--diagnostics <gray8|rgb8> <width> <height> | --batch | "
           "--metadata\n";
    return 2;
  }

  try {
    const int argumentOffset = diagnostics ? 1 : 0;
    const std::string format(argv[1 + argumentOffset]);
    if (format != "gray8" && format != "rgb8") {
      throw std::invalid_argument("format must be gray8 or rgb8");
    }

    const int width = parseDimension(argv[2 + argumentOffset], "width");
    const int height = parseDimension(argv[3 + argumentOffset], "height");
    const std::size_t expectedBytes = expectedInputBytes(format, width, height);

    std::vector<uint8_t> input(expectedBytes);
    std::cin.read(
        reinterpret_cast<char*>(input.data()),
        static_cast<std::streamsize>(expectedBytes));
    const std::size_t receivedBytes = static_cast<std::size_t>(std::cin.gcount());
    if (receivedBytes != expectedBytes) {
      throw std::invalid_argument(
          "expected " + std::to_string(expectedBytes) + " input bytes, received " +
          std::to_string(receivedBytes));
    }
    if (std::cin.peek() != std::char_traits<char>::eof()) {
      throw std::invalid_argument(
          "expected " + std::to_string(expectedBytes) +
          " input bytes, received more than expected");
    }

    hashAndWriteResult(format, width, height, input, diagnostics);
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "pdq-oracle: " << error.what() << "\n";
    return 2;
  }
}
