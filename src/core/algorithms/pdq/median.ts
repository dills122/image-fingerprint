const addFloat32 = (left: number, right: number): number => (
  Math.fround(left + right)
);

const divideFloat32 = (value: number, divisor: number): number => (
  Math.fround(value / divisor)
);

/** @internal Computes Torben Mogensen's selection-free lower median. */
export const torbenMedian = (values: Float32Array): number => {
  if (values.length === 0) {
    throw new RangeError('Torben median requires at least one value');
  }

  const midpoint = Math.floor((values.length + 1) / 2);
  let minimum = values[0];
  let maximum = values[0];
  for (const value of values) {
    if (value < minimum) {
      minimum = value;
    }
    if (value > maximum) {
      maximum = value;
    }
  }

  while (true) {
    const guess = divideFloat32(addFloat32(minimum, maximum), 2);
    let less = 0;
    let greater = 0;
    let equal = 0;
    let maximumBelowGuess = minimum;
    let minimumAboveGuess = maximum;

    for (const value of values) {
      if (value < guess) {
        less += 1;
        if (value > maximumBelowGuess) {
          maximumBelowGuess = value;
        }
      } else if (value > guess) {
        greater += 1;
        if (value < minimumAboveGuess) {
          minimumAboveGuess = value;
        }
      } else {
        equal += 1;
      }
    }

    if (less <= midpoint && greater <= midpoint) {
      if (less >= midpoint) {
        return maximumBelowGuess;
      }
      if (less + equal >= midpoint) {
        return guess;
      }
      return minimumAboveGuess;
    }
    if (less > greater) {
      maximum = maximumBelowGuess;
    } else {
      minimum = minimumAboveGuess;
    }
  }
};
