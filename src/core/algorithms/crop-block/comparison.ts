export type CropBlockMatchingStrategy = 'directed' | 'mutual' | 'one-to-one';

export interface CropBlockComparableSegment {
  readonly hash: string;
  readonly kind?: 'bright' | 'dark' | 'fallback';
  readonly quality?: number;
}

export interface CropBlockComparisonOptions {
  readonly allowFallback?: boolean;
  readonly minimumBitBalance?: number;
  readonly minimumQuality?: number;
  readonly requirePolarity?: boolean;
}

export interface CropBlockMatchedPair {
  readonly queryIndex: number;
  readonly candidateIndex: number;
  readonly distance: number;
  readonly normalizedDistance: number;
}

export interface CropBlockComparisonEvidence {
  readonly strategy: CropBlockMatchingStrategy;
  readonly querySegments: number;
  readonly candidateSegments: number;
  readonly matchedRegions: number;
  readonly pairs: readonly CropBlockMatchedPair[];
  readonly queryCoverage: number;
  readonly candidateCoverage: number;
  readonly totalDistance: number;
  readonly meanMatchedDistance: number | null;
}

const POPCOUNT = Uint8Array.of(0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);

export const cropBlockHammingDistance = (left: string, right: string): number => {
  if (
    left.length !== 64
    || right.length !== 64
    || !/^[0-9a-f]{64}$/.test(left)
    || !/^[0-9a-f]{64}$/.test(right)
  ) {
    throw new RangeError('crop-block region hashes must be 64 lowercase hexadecimal characters');
  }
  let distance = 0;
  for (let index = 0; index < 64; index += 1) {
    distance += POPCOUNT[Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16)];
  }
  return distance;
};

const distanceMatrix = (
  query: readonly CropBlockComparableSegment[],
  candidate: readonly CropBlockComparableSegment[],
  options: CropBlockComparisonOptions,
): number[][] => {
  const minimumBitBalance = options.minimumBitBalance ?? 0;
  const minimumQuality = options.minimumQuality ?? 0;
  if (
    !Number.isInteger(minimumBitBalance)
    || minimumBitBalance < 0
    || minimumBitBalance > 128
  ) {
    throw new RangeError('minimum bit balance must be an integer from 0 through 128');
  }
  if (!Number.isInteger(minimumQuality) || minimumQuality < 0 || minimumQuality > 100) {
    throw new RangeError('minimum quality must be an integer from 0 through 100');
  }
  const bitBalance = (hash: string): number => {
    const ones = cropBlockHammingDistance(hash, '0'.repeat(64));
    return Math.min(ones, 256 - ones);
  };
  const eligible = (segment: CropBlockComparableSegment): boolean => (
    (options.allowFallback !== false || segment.kind !== 'fallback')
    && bitBalance(segment.hash) >= minimumBitBalance
    && (segment.quality === undefined || segment.quality >= minimumQuality)
  );
  return query.map((querySegment) => candidate.map((candidateSegment) => {
    if (!eligible(querySegment) || !eligible(candidateSegment)) return Number.POSITIVE_INFINITY;
    if (
      options.requirePolarity === true
      && querySegment.kind !== undefined
      && candidateSegment.kind !== undefined
      && querySegment.kind !== candidateSegment.kind
    ) {
      return Number.POSITIVE_INFINITY;
    }
    return cropBlockHammingDistance(querySegment.hash, candidateSegment.hash);
  }));
};

const nearestIndex = (values: readonly number[]): number => {
  let best = -1;
  let bestValue = Number.POSITIVE_INFINITY;
  values.forEach((value, index) => {
    if (value < bestValue) {
      best = index;
      bestValue = value;
    }
  });
  return best;
};

const directedPairs = (matrix: readonly number[][], cutoff: number): CropBlockMatchedPair[] => (
  matrix.flatMap((row, queryIndex) => {
    const candidateIndex = nearestIndex(row);
    if (candidateIndex < 0 || row[candidateIndex] > cutoff) return [];
    const distance = row[candidateIndex];
    return [{ queryIndex, candidateIndex, distance, normalizedDistance: distance / 256 }];
  })
);

const mutualPairs = (matrix: readonly number[][], cutoff: number): CropBlockMatchedPair[] => {
  if (matrix.length === 0 || matrix[0].length === 0) return [];
  const candidateNearest = matrix[0].map((_, candidateIndex) => nearestIndex(
    matrix.map((row) => row[candidateIndex]),
  ));
  return directedPairs(matrix, cutoff).filter(
    (pair) => candidateNearest[pair.candidateIndex] === pair.queryIndex,
  );
};

interface FlowEdge {
  to: number;
  reverse: number;
  capacity: number;
  cost: number;
  queryIndex?: number;
  candidateIndex?: number;
  distance?: number;
}

const oneToOnePairs = (matrix: readonly number[][], cutoff: number): CropBlockMatchedPair[] => {
  const queryCount = matrix.length;
  const candidateCount = queryCount === 0 ? 0 : matrix[0].length;
  const source = 0;
  const queryOffset = 1;
  const candidateOffset = queryOffset + queryCount;
  const sink = candidateOffset + candidateCount;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, edge: Omit<FlowEdge, 'reverse'>): void => {
    const forward: FlowEdge = { ...edge, reverse: graph[edge.to].length };
    const reverse: FlowEdge = {
      to: from,
      reverse: graph[from].length,
      capacity: 0,
      cost: -edge.cost,
    };
    graph[from].push(forward);
    graph[edge.to].push(reverse);
  };
  for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
    addEdge(source, { to: queryOffset + queryIndex, capacity: 1, cost: 0 });
    for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
      const distance = matrix[queryIndex][candidateIndex];
      if (distance <= cutoff) {
        addEdge(queryOffset + queryIndex, {
          to: candidateOffset + candidateIndex,
          capacity: 1,
          cost: distance,
          queryIndex,
          candidateIndex,
          distance,
        });
      }
    }
  }
  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    addEdge(candidateOffset + candidateIndex, { to: sink, capacity: 1, cost: 0 });
  }

  while (true) {
    const distances = new Float64Array(graph.length);
    distances.fill(Number.POSITIVE_INFINITY);
    distances[source] = 0;
    const previousNode = new Int32Array(graph.length).fill(-1);
    const previousEdge = new Int32Array(graph.length).fill(-1);
    for (let iteration = 0; iteration < graph.length - 1; iteration += 1) {
      let changed = false;
      for (let node = 0; node < graph.length; node += 1) {
        if (!Number.isFinite(distances[node])) continue;
        graph[node].forEach((edge, edgeIndex) => {
          const nextDistance = distances[node] + edge.cost;
          if (edge.capacity > 0 && nextDistance < distances[edge.to]) {
            distances[edge.to] = nextDistance;
            previousNode[edge.to] = node;
            previousEdge[edge.to] = edgeIndex;
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (previousNode[sink] < 0) break;
    for (let node = sink; node !== source; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]];
      edge.capacity -= 1;
      graph[node][edge.reverse].capacity += 1;
    }
  }

  const pairs: CropBlockMatchedPair[] = [];
  for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
    graph[queryOffset + queryIndex].forEach((edge) => {
      if (
        edge.queryIndex !== undefined
        && edge.candidateIndex !== undefined
        && edge.distance !== undefined
        && edge.capacity === 0
      ) {
        pairs.push({
          queryIndex: edge.queryIndex,
          candidateIndex: edge.candidateIndex,
          distance: edge.distance,
          normalizedDistance: edge.distance / 256,
        });
      }
    });
  }
  return pairs.sort((left, right) => left.queryIndex - right.queryIndex);
};

export const compareCropBlockSegments = (
  query: readonly CropBlockComparableSegment[],
  candidate: readonly CropBlockComparableSegment[],
  strategy: CropBlockMatchingStrategy,
  maximumRegionDistance: number,
  options: CropBlockComparisonOptions = {},
): CropBlockComparisonEvidence => {
  if (
    !Number.isInteger(maximumRegionDistance)
    || maximumRegionDistance < 0
    || maximumRegionDistance > 256
  ) {
    throw new RangeError('maximum region distance must be an integer from 0 through 256');
  }
  const matrix = distanceMatrix(query, candidate, options);
  const pairs = strategy === 'directed'
    ? directedPairs(matrix, maximumRegionDistance)
    : strategy === 'mutual'
      ? mutualPairs(matrix, maximumRegionDistance)
      : strategy === 'one-to-one'
        ? oneToOnePairs(matrix, maximumRegionDistance)
        : undefined;
  if (pairs === undefined) throw new RangeError(`Unsupported crop-block strategy: ${strategy}`);
  const uniqueCandidates = new Set(pairs.map((pair) => pair.candidateIndex)).size;
  const totalDistance = pairs.reduce((total, pair) => total + pair.distance, 0);
  return {
    strategy,
    querySegments: query.length,
    candidateSegments: candidate.length,
    matchedRegions: pairs.length,
    pairs,
    queryCoverage: query.length === 0 ? 0 : pairs.length / query.length,
    candidateCoverage: candidate.length === 0 ? 0 : uniqueCandidates / candidate.length,
    totalDistance,
    meanMatchedDistance: pairs.length === 0 ? null : totalDistance / pairs.length,
  };
};
