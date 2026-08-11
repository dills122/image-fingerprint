const DESCRIPTOR_PATTERN = /^[0-9a-f]{64}$/u;
const TOKEN_PATTERN = /^(?:[0-9]|1[0-5]):[0-9a-f]{4}$/u;
const HYDRATED_INDEXES = new WeakSet();

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

const descriptorTokens = (fingerprint) => {
  assertFingerprint(fingerprint);
  const tokens = new Set();
  for (const { descriptor } of fingerprint.local.features) {
    for (let offset = 0; offset < descriptor.length; offset += 4) {
      tokens.add(`${offset / 4}:${descriptor.slice(offset, offset + 4)}`);
    }
  }
  return [...tokens];
};

const validateDocument = (document) => {
  if (
    !isRecord(document)
    || document.schemaVersion !== 1
    || JSON.stringify(document.profile) !== JSON.stringify(CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE)
    || !Array.isArray(document.referenceIds)
    || document.referenceIds.length === 0
    || !Array.isArray(document.postings)
    || !isRecord(document.statistics)
  ) throw new Error('invalid crop-local item-color retrieval index');

  const sortedIds = [...document.referenceIds].sort((left, right) => left.localeCompare(right));
  if (
    document.referenceIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(document.referenceIds).size !== document.referenceIds.length
    || sortedIds.some((id, index) => id !== document.referenceIds[index])
  ) throw new Error('retrieval reference IDs must be unique sorted non-empty strings');

  let previousToken = null;
  let postingEntries = 0;
  for (const posting of document.postings) {
    if (!Array.isArray(posting) || posting.length !== 2) {
      throw new Error('retrieval postings must be token and ordinal pairs');
    }
    const [token, ordinals] = posting;
    if (
      typeof token !== 'string'
      || !TOKEN_PATTERN.test(token)
      || (previousToken !== null && previousToken.localeCompare(token) >= 0)
      || !Array.isArray(ordinals)
      || ordinals.length === 0
    ) throw new Error('retrieval posting tokens must be unique, sorted, and non-empty');
    let previousOrdinal = -1;
    for (const ordinal of ordinals) {
      if (
        !Number.isSafeInteger(ordinal)
        || ordinal <= previousOrdinal
        || ordinal >= document.referenceIds.length
      ) throw new Error('retrieval posting ordinals must be unique, sorted, and in range');
      previousOrdinal = ordinal;
      postingEntries += 1;
    }
    if (ordinals.length / document.referenceIds.length > CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE.maximumDocumentFrequency) {
      throw new Error('retrieval index contains a token above the document-frequency ceiling');
    }
    previousToken = token;
  }
  if (
    document.statistics.indexedTokens !== document.postings.length
    || document.statistics.postingEntries !== postingEntries
    || !Number.isSafeInteger(document.statistics.droppedHighFrequencyTokens)
    || document.statistics.droppedHighFrequencyTokens < 0
  ) throw new Error('retrieval index statistics do not match its postings');
  return document;
};

const hydrate = (document) => {
  const index = { document, postings: new Map(document.postings) };
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
    for (const token of descriptorTokens(fingerprint)) {
      const ordinals = candidates.get(token) ?? [];
      ordinals.push(ordinal);
      candidates.set(token, ordinals);
    }
  });
  const maximumDocumentFrequency = CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE.maximumDocumentFrequency;
  const postings = [...candidates]
    .filter(([, ordinals]) => ordinals.length / ordered.length <= maximumDocumentFrequency)
    .sort(([left], [right]) => left.localeCompare(right));
  const document = validateDocument({
    schemaVersion: 1,
    profile: CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE,
    referenceIds,
    postings,
    statistics: {
      indexedTokens: postings.length,
      postingEntries: postings.reduce((sum, [, ordinals]) => sum + ordinals.length, 0),
      droppedHighFrequencyTokens: candidates.size - postings.length,
    },
  });
  return hydrate(document);
};

export const serializeCropLocalItemColorRetrievalIndex = index => (
  `${JSON.stringify(validateDocument(index?.document))}\n`
);

export const loadCropLocalItemColorRetrievalIndex = (serialized) => {
  if (typeof serialized !== 'string' && !ArrayBuffer.isView(serialized)) {
    throw new TypeError('serialized retrieval index must be text or bytes');
  }
  const text = typeof serialized === 'string'
    ? serialized
    : Buffer.from(serialized.buffer, serialized.byteOffset, serialized.byteLength).toString('utf8');
  return hydrate(validateDocument(JSON.parse(text)));
};

export const queryCropLocalItemColorRetrievalIndex = (
  index,
  fingerprint,
  limit = CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
) => {
  if (!isRecord(index) || !HYDRATED_INDEXES.has(index) || !(index.postings instanceof Map)) {
    throw new TypeError('retrieval index must be hydrated');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > index.document.referenceIds.length) {
    throw new RangeError('retrieval candidate limit must be within the reference count');
  }
  const tokens = descriptorTokens(fingerprint);
  const scores = new Map();
  let indexedQueryTokens = 0;
  let postingEntriesVisited = 0;
  for (const token of tokens) {
    const ordinals = index.postings.get(token);
    if (ordinals === undefined) continue;
    indexedQueryTokens += 1;
    postingEntriesVisited += ordinals.length;
    const weight = Math.log((index.document.referenceIds.length + 1) / (ordinals.length + 1)) + 1;
    for (const ordinal of ordinals) {
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
    queryTokens: tokens.length,
    indexedQueryTokens,
    postingEntriesVisited,
  };
};
