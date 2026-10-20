"use strict";

window.GoldPrice = (() => {
  const API_URL =
    "https://xaus.com/api/v1/spot?compact=1";

  async function getGoldPrice() {
    const response = await fetch(API_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Gold price service unavailable.");
    }

    const data = await response.json();

    if (
      typeof data.spot_usd_oz !== "number" ||
      !Number.isFinite(data.spot_usd_oz)
    ) {
      throw new Error("Unexpected price-data format.");
    }

    return {
      price: data.spot_usd_oz,
      status: data.data_state?.status ?? "unknown",
      source: "XAUS indicative spot price",
      updatedAt: new Date().toISOString()
    };
  }

  return { getGoldPrice };
})();
