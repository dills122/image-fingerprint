const HASH_WORD_COUNT = 16;
const HASH_BYTE_LENGTH = HASH_WORD_COUNT * Uint16Array.BYTES_PER_ELEMENT;
const MAXIMUM_RGB_BYTES = 64 * 1024 * 1024;

export const formatPdqWasmHash = words => {
  if (!(words instanceof Uint16Array) || words.length !== HASH_WORD_COUNT) {
    throw new TypeError('PDQ WASM hash must contain exactly 16 unsigned 16-bit words');
  }
  return Array.from(words, word => word.toString(16).padStart(4, '0'))
    .reverse()
    .join('');
};

const requireFunction = (exports, name) => {
  const value = exports[name];
  if (typeof value !== 'function') {
    throw new TypeError(`PDQ WASM module did not export ${name}`);
  }
  return value;
};

export const instantiatePdqWasm = async compiledModule => {
  let instance;
  const imports = {
    env: {
      emscripten_notify_memory_growth: () => {},
      getentropy: (pointer, length) => {
        if (instance === undefined) return -1;
        const destination = new Uint8Array(instance.exports.memory.buffer, pointer, length);
        globalThis.crypto.getRandomValues(destination);
        return 0;
      },
    },
    wasi_snapshot_preview1: {
      proc_exit: code => {
        throw new Error(`PDQ WASM called proc_exit(${code})`);
      },
    },
  };
  instance = await WebAssembly.instantiate(compiledModule, imports);
  const initialize = instance.exports._initialize;
  if (typeof initialize === 'function') initialize();
  if (!(instance.exports.memory instanceof WebAssembly.Memory)) {
    throw new TypeError('PDQ WASM module did not export memory');
  }
  requireFunction(instance.exports, 'malloc');
  requireFunction(instance.exports, 'free');
  requireFunction(instance.exports, 'pdq_hash_rgb');
  return instance;
};

export const createPdqWasmHasher = (instance, rgb, width, height) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 5 || height < 5) {
    throw new RangeError('PDQ WASM dimensions must be safe integers of at least 5 pixels');
  }
  if (!(rgb instanceof Uint8Array) || rgb.byteLength !== width * height * 3) {
    throw new TypeError('PDQ WASM input must be tightly packed RGB8 pixels');
  }
  if (rgb.byteLength > MAXIMUM_RGB_BYTES) {
    throw new RangeError(`PDQ WASM input exceeds ${MAXIMUM_RGB_BYTES} bytes`);
  }
  const { exports } = instance;
  const memory = exports.memory;
  const malloc = requireFunction(exports, 'malloc');
  const free = requireFunction(exports, 'free');
  const hashRgb = requireFunction(exports, 'pdq_hash_rgb');
  const inputPointer = Number(malloc(rgb.byteLength));
  const outputPointer = Number(malloc(HASH_BYTE_LENGTH));
  if (inputPointer === 0 || outputPointer === 0) {
    if (inputPointer !== 0) free(inputPointer);
    if (outputPointer !== 0) free(outputPointer);
    throw new Error('PDQ WASM could not allocate benchmark buffers');
  }
  new Uint8Array(memory.buffer, inputPointer, rgb.byteLength).set(rgb);
  let disposed = false;

  return {
    hash() {
      if (disposed) throw new Error('PDQ WASM benchmark hasher is disposed');
      const quality = Number(hashRgb(inputPointer, width, height, outputPointer));
      if (quality < 0) throw new Error(`PDQ WASM hashing failed with code ${quality}`);
      const words = new Uint16Array(memory.buffer, outputPointer, HASH_WORD_COUNT);
      return { hash: formatPdqWasmHash(words), quality };
    },
    memoryBytes() {
      return memory.buffer.byteLength;
    },
    dispose() {
      if (!disposed) {
        free(inputPointer);
        free(outputPointer);
        disposed = true;
      }
    },
  };
};
