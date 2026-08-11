const DESCRIPTOR_PATTERN = /^[0-9a-f]{64}$/u;
const TOKEN_PATTERN = /^(?:[0-9]|1[0-5]):[0-9a-f]{4}$/u;
const HYDRATED_INDEXES = new WeakSet();
const CURRENT_SCHEMA_VERSION = 2;
const POSTING_ENCODING = 'delta-varint-base64-columns-v1';
const TOKEN_POSITIONS = 16;
const TOKEN_VALUES = 0x1_0000;
const TOKEN_SPACE = TOKEN_POSITIONS * TOKEN_VALUES;

export const CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE = Object.freeze({
  name: 'crop-local-item-color-descriptor-idf-v0',
  fingerprintProfile: 'crop-local-item-color-v0',
  descriptorTokenBits: 16,
  deduplicateWithinImage: true,
  inverseDocumentFrequency: 'ln((referenceCount+1)/(documentFrequency+1))+1',
  maximumDocumentFrequency: 0.2,
});

export const CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT = 50;

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const assertFingerprint = (fingerprint) => {
  if (
    !isRecord(fingerprint)
    || fingerprint.experimentalProfile !== CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE.fingerprintProfile
    || !isRecord(fingerprint.local)
    || !Array.isArray(fingerprint.local.features)
  ) {
    throw new TypeError('retrieval requires a crop-local-item-color-v0 fingerprint');
  }
  for (const [index, feature] of fingerprint.local.features.entries()) {
    if (!isRecord(feature) || typeof feature.descriptor !== 'string' || !DESCRIPTOR_PATTERN.test(feature.descriptor)) {
      throw new RangeError(`retrieval feature ${index} descriptor must be 256-bit lowercase hex`);
    }
  }
};

const descriptorTokenIds = (fingerprint) => {
  assertFingerprint(fingerprint);
  const tokenIds = new Set();
  for (const { descriptor } of fingerprint.local.features) {
    for (let position = 0; position < TOKEN_POSITIONS; position += 1) {
      const offset = position * 4;
      tokenIds.add(position * TOKEN_VALUES + Number.parseInt(descriptor.slice(offset, offset + 4), 16));
    }
  }
  return [...tokenIds];
};

const legacyTokenId = (token) => {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const separator = token.indexOf(':');
  return Number.parseInt(token.slice(0, separator), 10) * TOKEN_VALUES
    + Number.parseInt(token.slice(separator + 1), 16);
};

const encodeUnsignedIntegers = (values) => {
  const bytes = Buffer.allocUnsafe(values.length * 5);
  let offset = 0;
  for (const integer of values) {
    let value = integer;
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      bytes[offset] = value === 0 ? byte : byte | 0x80;
      offset += 1;
    } while (value !== 0);
  }
  return bytes.subarray(0, offset).toString('base64');
};

const decodeUnsignedIntegers = (encoded, count, label) => {
  if (count === 0 && encoded === '') return new Uint32Array();
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error(`retrieval ${label} must be non-empty base64`);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== encoded) {
    throw new Error(`retrieval ${label} must use canonical base64`);
  }
  if (count > bytes.length) {
    throw new Error(`retrieval ${label} cannot contain ${count} values`);
  }
  const integers = new Uint32Array(count);
  let integerIndex = 0;
  let value = 0;
  let multiplier = 1;
  for (const byte of bytes) {
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value) || value > 0xffff_ffff) {
      throw new Error(`retrieval ${label} value is out of range`);
    }
    if ((byte & 0x80) !== 0) {
      multiplier *= 128;
      if (!Number.isSafeInteger(multiplier)) {
        throw new Error(`retrieval ${label} value is out of range`);
      }
      continue;
    }
    if (multiplier !== 1 && (byte & 0x7f) === 0) {
      throw new Error(`retrieval ${label} must use canonical varints`);
    }
    if (integerIndex >= count) throw new Error(`retrieval ${label} contains too many values`);
    integers[integerIndex] = value;
    integerIndex += 1;
    value = 0;
    multiplier = 1;
  }
  if (multiplier !== 1 || integerIndex !== count) {
    throw new Error(`retrieval ${label} must encode exactly ${count} values`);
  }
  return integers;
};

const validateStatistics = (statistics) => {
  if (
    !isRecord(statistics)
    || !Number.isSafeInteger(statistics.indexedTokens)
    || statistics.indexedTokens < 0
    || statistics.indexedTokens > TOKEN_SPACE
    || !Number.isSafeInteger(statistics.postingEntries)
    || statistics.postingEntries < 0
    || statistics.postingEntries > 0xffff_ffff
    || !Number.isSafeInteger(statistics.droppedHighFrequencyTokens)
    || statistics.droppedHighFrequencyTokens < 0
  ) throw new Error('invalid crop-local item-color retrieval index statistics');
};

const validateReferenceIds = (referenceIds) => {
  if (!Array.isArray(referenceIds) || referenceIds.length === 0 || referenceIds.length > 0xffff_ffff) {
    throw new Error('invalid crop-local item-color retrieval reference IDs');
  }
  const sortedIds = [...referenceIds].sort((left, right) => left.localeCompare(right));
  if (
    referenceIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(referenceIds).size !== referenceIds.length
    || sortedIds.some((id, index) => id !== referenceIds[index])
  ) throw new Error('retrieval reference IDs must be unique sorted non-empty strings');
};

const validateLegacyPostings = (document) => {
  if (!Array.isArray(document.postings)) {
    throw new Error('retrieval schema-v1 postings must be an array');
  }
  const tokenIds = new Uint32Array(document.postings.length);
  const postingOffsets = new Uint32Array(document.postings.length + 1);
  const postingOrdinals = new Uint32Array(document.statistics.postingEntries);
  let previousToken = null;
  let ordinalIndex = 0;
  for (const [postingIndex, posting] of document.postings.entries()) {
    if (!Array.isArray(posting) || posting.length !== 2) {
      throw new Error('retrieval postings must be token and ordinal pairs');
    }
    const [token, ordinals] = posting;
    const tokenId = legacyTokenId(token);
    if (
      tokenId === null
      || (previousToken !== null && previousToken.localeCompare(token) >= 0)
      || !Array.isArray(ordinals)
      || ordinals.length === 0
    ) throw new Error('retrieval posting tokens and ordinal arrays must be unique and non-empty');
    if (ordinals.length / document.referenceIds.length > CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE.maximumDocumentFrequency) {
      throw new Error('retrieval index contains a token above the document-frequency ceiling');
    }
    tokenIds[postingIndex] = tokenId;
    postingOffsets[postingIndex] = ordinalIndex;
    let previousOrdinal = -1;
    for (const ordinal of ordinals) {
      if (
        !Number.isSafeInteger(ordinal)
        || ordinal <= previousOrdinal
        || ordinal >= document.referenceIds.length
        || ordinalIndex >= postingOrdinals.length
      ) throw new Error('retrieval posting ordinals must be unique, sorted, and in range');
      postingOrdinals[ordinalIndex] = ordinal;
      ordinalIndex += 1;
      previousOrdinal = ordinal;
    }
    previousToken = token;
  }
  postingOffsets[document.postings.length] = ordinalIndex;
  if (
    document.statistics.indexedTokens !== document.postings.length
    || ordinalIndex !== document.statistics.postingEntries
  ) throw new Error('retrieval index statistics do not match its postings');
  return { postingOffsets, postingOrdinals, tokenIds };
};

const validateCompactPostings = (document) => {
  if (!isRecord(document.postings) || document.postingEncoding !== POSTING_ENCODING) {
    throw new Error('invalid crop-local item-color retrieval posting encoding');
  }
  const tokenCount = document.statistics.indexedTokens;
  const tokenDeltas = decodeUnsignedIntegers(document.postings.tokenIds, tokenCount, 'posting token IDs');
  const postingLengths = decodeUnsignedIntegers(document.postings.lengths, tokenCount, 'posting lengths');
  const ordinalDeltas = decodeUnsignedIntegers(
    document.postings.ordinals,
    document.statistics.postingEntries,
    'posting ordinals',
  );
  const tokenIds = new Uint32Array(tokenCount);
  const postingOffsets = new Uint32Array(tokenCount + 1);
  let previousTokenId = -1;
  let ordinalIndex = 0;
  for (let postingIndex = 0; postingIndex < tokenCount; postingIndex += 1) {
    const tokenDelta = tokenDeltas[postingIndex];
    const tokenId = previousTokenId + tokenDelta;
    const postingLength = postingLengths[postingIndex];
    if (tokenDelta === 0 || tokenId >= TOKEN_SPACE) {
      throw new Error('retrieval posting token IDs must be unique, sorted, and in range');
    }
    if (
      postingLength === 0
      || postingLength / document.referenceIds.length > CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE.maximumDocumentFrequency
    ) throw new Error('retrieval posting length is outside the document-frequency ceiling');
    tokenIds[postingIndex] = tokenId;
    postingOffsets[postingIndex] = ordinalIndex;
    let previousOrdinal = -1;
    for (let offset = 0; offset < postingLength; offset += 1) {
      const ordinalDelta = ordinalDeltas[ordinalIndex];
      const ordinal = previousOrdinal + ordinalDelta;
      if (ordinalDelta === 0 || ordinal >= document.referenceIds.length) {
        throw new Error('retrieval posting ordinals must be unique, sorted, and in range');
      }
      ordinalDeltas[ordinalIndex] = ordinal;
      ordinalIndex += 1;
      previousOrdinal = ordinal;
    }
    previousTokenId = tokenId;
  }
  postingOffsets[tokenCount] = ordinalIndex;
  if (ordinalIndex !== document.statistics.postingEntries) {
    throw new Error('retrieval index statistics do not match its postings');
  }
  return { postingOffsets, postingOrdinals: ordinalDeltas, tokenIds };
};

const validateDocument = (document) => {
  if (
    !isRecord(document)
    || (document.schemaVersion !== 1 && document.schemaVersion !== CURRENT_SCHEMA_VERSION)
    || JSON.stringify(document.profile) !== JSON.stringify(CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE)
  ) throw new Error('invalid crop-local item-color retrieval index');
  validateReferenceIds(document.referenceIds);
  validateStatistics(document.statistics);
  const postings = document.schemaVersion === 1
    ? validateLegacyPostings(document)
    : validateCompactPostings(document);
  return { document, ...postings };
};

const hydrate = (document) => {
  const validated = validateDocument(document);
  const postingLookup = new Int32Array(TOKEN_SPACE);
  postingLookup.fill(-1);
  validated.tokenIds.forEach((tokenId, postingIndex) => {
    if (postingLookup[tokenId] !== -1) throw new Error('retrieval posting token IDs must be unique');
    postingLookup[tokenId] = postingIndex;
  });
  const index = {
    document: validated.document,
    postingLookup,
    postingOffsets: validated.postingOffsets,
    postingOrdinals: validated.postingOrdinals,
  };
  HYDRATED_INDEXES.add(index);
  return index;
};

export const buildCropLocalItemColorRetrievalIndex = (references) => {
  if (!Array.isArray(references) || references.length === 0) {
    throw new TypeError('retrieval references must be a non-empty array');
  }
  if (references.some(reference => !isRecord(reference) || typeof reference.id !== 'string')) {
    throw new TypeError('retrieval reference IDs must be strings');
  }
  const ordered = [...references].sort((left, right) => left.id.localeCompare(right.id));
  const referenceIds = ordered.map(({ id }) => id);
  if (referenceIds.some(id => id.length === 0) || new Set(referenceIds).size !== referenceIds.length) {
    throw new Error('retrieval reference IDs must be unique non-empty strings');
  }
  const candidates = new Map();
  ordered.forEach(({ fingerprint }, ordinal) => {
    for (const tokenId of descriptorTokenIds(fingerprint)) {
      const ordinals = candidates.get(tokenId) ?? [];
      ordinals.push(ordinal);
      candidates.set(tokenId, ordinals);
    }
  });
  const maximumDocumentFrequency = CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE.maximumDocumentFrequency;
  const retainedPostings = [...candidates]
    .filter(([, ordinals]) => ordinals.length / ordered.length <= maximumDocumentFrequency)
    .sort(([left], [right]) => left - right);
  const postingEntries = retainedPostings.reduce((sum, [, ordinals]) => sum + ordinals.length, 0);
  const tokenDeltas = new Uint32Array(retainedPostings.length);
  const postingLengths = new Uint32Array(retainedPostings.length);
  const ordinalDeltas = new Uint32Array(postingEntries);
  let previousTokenId = -1;
  let ordinalIndex = 0;
  retainedPostings.forEach(([tokenId, ordinals], postingIndex) => {
    tokenDeltas[postingIndex] = tokenId - previousTokenId;
    postingLengths[postingIndex] = ordinals.length;
    let previousOrdinal = -1;
    for (const ordinal of ordinals) {
      ordinalDeltas[ordinalIndex] = ordinal - previousOrdinal;
      ordinalIndex += 1;
      previousOrdinal = ordinal;
    }
    previousTokenId = tokenId;
  });
  const document = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE,
    referenceIds,
    postingEncoding: POSTING_ENCODING,
    postings: {
      tokenIds: encodeUnsignedIntegers(tokenDeltas),
      lengths: encodeUnsignedIntegers(postingLengths),
      ordinals: encodeUnsignedIntegers(ordinalDeltas),
    },
    statistics: {
      indexedTokens: retainedPostings.length,
      postingEntries,
      droppedHighFrequencyTokens: candidates.size - retainedPostings.length,
    },
  };
  return hydrate(document);
};

export const serializeCropLocalItemColorRetrievalIndex = index => (
  `${JSON.stringify(validateDocument(index?.document).document)}\n`
);

export const loadCropLocalItemColorRetrievalIndex = (serialized) => {
  if (typeof serialized !== 'string' && !ArrayBuffer.isView(serialized)) {
    throw new TypeError('serialized retrieval index must be text or bytes');
  }
  const text = typeof serialized === 'string'
    ? serialized
    : Buffer.from(serialized.buffer, serialized.byteOffset, serialized.byteLength).toString('utf8');
  return hydrate(JSON.parse(text));
};

export const queryCropLocalItemColorRetrievalIndex = (
  index,
  fingerprint,
  limit = CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
) => {
  if (
    !isRecord(index)
    || !HYDRATED_INDEXES.has(index)
    || !(index.postingLookup instanceof Int32Array)
    || !(index.postingOffsets instanceof Uint32Array)
    || !(index.postingOrdinals instanceof Uint32Array)
  ) throw new TypeError('retrieval index must be hydrated');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > index.document.referenceIds.length) {
    throw new RangeError('retrieval candidate limit must be within the reference count');
  }
  const tokenIds = descriptorTokenIds(fingerprint);
  const scores = new Map();
  let indexedQueryTokens = 0;
  let postingEntriesVisited = 0;
  for (const tokenId of tokenIds) {
    const postingIndex = index.postingLookup[tokenId];
    if (postingIndex === -1) continue;
    indexedQueryTokens += 1;
    const start = index.postingOffsets[postingIndex];
    const end = index.postingOffsets[postingIndex + 1];
    const postingLength = end - start;
    postingEntriesVisited += postingLength;
    const weight = Math.log((index.document.referenceIds.length + 1) / (postingLength + 1)) + 1;
    for (let cursor = start; cursor < end; cursor += 1) {
      const ordinal = index.postingOrdinals[cursor];
      const current = scores.get(ordinal) ?? { score: 0, matchedTokens: 0 };
      current.score += weight;
      current.matchedTokens += 1;
      scores.set(ordinal, current);
    }
  }
  const ranked = [...scores].sort((left, right) => (
    right[1].score - left[1].score
    || index.document.referenceIds[left[0]].localeCompare(index.document.referenceIds[right[0]])
  ));
  return {
    candidates: ranked.slice(0, limit).map(([ordinal, evidence]) => ({
      id: index.document.referenceIds[ordinal],
      ...evidence,
    })),
    candidatesWithEvidence: scores.size,
    queryTokens: tokenIds.length,
    indexedQueryTokens,
    postingEntriesVisited,
  };
};
