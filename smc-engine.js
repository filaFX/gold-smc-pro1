"use strict";

/*
 * GOLD SMC PRO — SMC Analysis Engine v1
 *
 * Input candle format:
 * {
 *   time: 1729000000,
 *   open: 2650.0,
 *   high: 2655.0,
 *   low: 2648.0,
 *   close: 2653.0,
 *   volume: 100
 * }
 *
 * Candles must be ordered oldest to newest.
 * Use completed candles for analysis.
 */

const SMC = (() => {
  function validateCandles(candles) {
    if (!Array.isArray(candles) || candles.length < 5) {
      throw new Error("Provide at least 5 candles.");
    }

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];

      if (
        !c ||
        !Number.isFinite(c.open) ||
        !Number.isFinite(c.high) ||
        !Number.isFinite(c.low) ||
        !Number.isFinite(c.close) ||
        c.high < c.low ||
        c.high < Math.max(c.open, c.close) ||
        c.low > Math.min(c.open, c.close)
      ) {
        throw new Error("Invalid candle at index " + i);
      }

      if (
        i > 0 &&
        Number.isFinite(c.time) &&
        Number.isFinite(candles[i - 1].time) &&
        c.time <= candles[i - 1].time
      ) {
        throw new Error("Candle times must be strictly increasing.");
      }
    }
  }

  function findSwings(candles, strength = 2) {
    const highs = [];
    const lows = [];

    for (let i = strength; i < candles.length - strength; i++) {
      let isHigh = true;
      let isLow = true;

      for (let j = 1; j <= strength; j++) {
        if (
          candles[i].high <= candles[i - j].high ||
          candles[i].high <= candles[i + j].high
        ) {
          isHigh = false;
        }

        if (
          candles[i].low >= candles[i - j].low ||
          candles[i].low >= candles[i + j].low
        ) {
          isLow = false;
        }
      }

      if (isHigh) {
        highs.push({ index: i, price: candles[i].high });
      }

      if (isLow) {
        lows.push({ index: i, price: candles[i].low });
      }
    }

    return { highs, lows };
  }

  function detectBOS(candles, swings) {
  const events = [];
  const brokenLevels = new Set();

  const swingLevels = [
    ...swings.highs.map(s => ({
      type: "HIGH",
      index: s.index,
      price: s.price
    })),
    ...swings.lows.map(s => ({
      type: "LOW",
      index: s.index,
      price: s.price
    }))
  ].sort((a, b) => a.index - b.index);

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    for (const swing of swingLevels) {
      if (swing.index >= i) continue;

      const key = `${swing.type}_${swing.index}`;

      if (brokenLevels.has(key)) continue;

      if (swing.type === "HIGH" && candle.close > swing.price) {
        events.push({
          type: "BULLISH_BOS",
          index: i,
          level: swing.price,
          swingIndex: swing.index
        });

        brokenLevels.add(key);
      }

      if (swing.type === "LOW" && candle.close < swing.price) {
        events.push({
          type: "BEARISH_BOS",
          index: i,
          level: swing.price,
          swingIndex: swing.index
        });

        brokenLevels.add(key);
      }
    }
  }

  events.sort((a, b) => a.index - b.index);

  return events;
  }
  function detectLiquiditySweeps(candles, swings) {
    const events = [];

    for (const swing of swings.highs) {
      for (let i = swing.index + 1; i < candles.length; i++) {
        const c = candles[i];

        // Price trades above a prior swing high, then closes below it.
        if (c.high > swing.price && c.close < swing.price) {
          events.push({
            type: "BUY_SIDE_LIQUIDITY_SWEEP",
            index: i,
            level: swing.price
          });
          break;
        }
      }
    }

    for (const swing of swings.lows) {
      for (let i = swing.index + 1; i < candles.length; i++) {
        const c = candles[i];

        // Price trades below a prior swing low, then closes above it.
        if (c.low < swing.price && c.close > swing.price) {
          events.push({
            type: "SELL_SIDE_LIQUIDITY_SWEEP",
            index: i,
            level: swing.price
          });
          break;
        }
      }
    }

    events.sort((a, b) => a.index - b.index);
    return events;
  }

  function detectFVG(candles) {
    const gaps = [];

    for (let i = 2; i < candles.length; i++) {
      const first = candles[i - 2];
      const current = candles[i];

      // Three-candle bullish gap.
      if (current.low > first.high) {
        gaps.push({
          type: "BULLISH_FVG",
          index: i,
          lower: first.high,
          upper: current.low
        });
      }

      // Three-candle bearish gap.
      if (current.high < first.low) {
        gaps.push({
          type: "BEARISH_FVG",
          index: i,
          lower: current.high,
          upper: first.low
        });
      }
    }

    return gaps;
  }

  function analyze(candles, options = {}) {
    validateCandles(candles);

    const strength = Number.isInteger(options.swingStrength)
      ? Math.max(1, Math.min(options.swingStrength, 10))
      : 2;

    const swings = findSwings(candles, strength);
    const bos = detectBOS(candles, swings);
    const sweeps = detectLiquiditySweeps(candles, swings);
    const fvgs = detectFVG(candles);

    const latestBOS = bos.length ? bos[bos.length - 1] : null;
    const latestSweep = sweeps.length
      ? sweeps[sweeps.length - 1]
      : null;

    const latestFVG = fvgs.length
      ? fvgs[fvgs.length - 1]
      : null;

    return {
      candleCount: candles.length,
      latestClose: candles[candles.length - 1].close,
      swings,
      bos,
      liquiditySweeps: sweeps,
      fvgs,
      summary: {
        latestBOS: latestBOS ? latestBOS.type : "NONE",
        latestLiquiditySweep: latestSweep
          ? latestSweep.type
          : "NONE",
        latestFVG: latestFVG ? latestFVG.type : "NONE"
      }
    };
  }

  return {
    analyze,
    findSwings,
    detectBOS,
    detectLiquiditySweeps,
    detectFVG
  };
})();

// Support browsers and future module integrations.
if (typeof window !== "undefined") {
  window.GoldSMC = SMC;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SMC;
}
