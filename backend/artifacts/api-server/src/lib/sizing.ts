import type { Avatar } from "@workspace/db";

export type SizeRec = {
  category: "shirt" | "pants" | "shoes";
  recommendedSize: string;
  secondarySize: string | null;
  basis: string;
  fitNote: string | null;
};

function letterFromChest(chestCm: number, bodyType: string): string {
  // Simple unisex-ish chart split by body type
  const chart: Array<[number, string]> =
    bodyType === "female"
      ? [
          [82, "XS"],
          [88, "S"],
          [94, "M"],
          [100, "L"],
          [108, "XL"],
          [116, "XXL"],
        ]
      : [
          [88, "XS"],
          [94, "S"],
          [100, "M"],
          [106, "L"],
          [114, "XL"],
          [122, "XXL"],
        ];
  for (const [max, size] of chart) {
    if (chestCm <= max) return size;
  }
  return "3XL";
}

export function computeSizeProfile(avatar: Avatar): SizeRec[] {
  const recs: SizeRec[] = [];

  // Shirt — prefer chest, fall back to weight/height estimate
  const chest =
    avatar.chestCm ??
    // rough estimate from BMI-ish heuristic
    Math.round(
      70 + (avatar.weightKg / ((avatar.heightCm / 100) ** 2) - 18) * 2.2,
    );
  const shirtSize = letterFromChest(chest, avatar.bodyType);
  recs.push({
    category: "shirt",
    recommendedSize: shirtSize,
    secondarySize: null,
    basis: avatar.chestCm
      ? `Chest ${avatar.chestCm} cm`
      : `Estimated from height ${avatar.heightCm} cm and weight ${avatar.weightKg} kg`,
    fitNote:
      avatar.shoulderCm && avatar.shoulderCm > 48
        ? "Broad shoulders — consider sizing up for a relaxed fit"
        : null,
  });

  // Pants — waist in inches + letter size
  const waistCm =
    avatar.waistCm ??
    Math.round(
      66 + (avatar.weightKg / ((avatar.heightCm / 100) ** 2) - 18) * 2.5,
    );
  const waistIn = Math.round(waistCm / 2.54);
  const pantLetter = letterFromChest(waistCm + 22, avatar.bodyType);
  const inseamIn = avatar.inseamCm ? Math.round(avatar.inseamCm / 2.54) : null;
  recs.push({
    category: "pants",
    recommendedSize: `W${waistIn}${inseamIn ? ` L${inseamIn}` : ""}`,
    secondarySize: pantLetter,
    basis: avatar.waistCm
      ? `Waist ${avatar.waistCm} cm${avatar.inseamCm ? `, inseam ${avatar.inseamCm} cm` : ""}`
      : `Estimated from height and weight`,
    fitNote:
      avatar.hipCm && avatar.waistCm && avatar.hipCm - avatar.waistCm > 25
        ? "Curvy fit — look for stretch fabrics or curvy cuts"
        : null,
  });

  // Shoes — EU size to US/UK secondary
  if (avatar.shoeSizeEu) {
    const eu = avatar.shoeSizeEu;
    const us =
      avatar.bodyType === "female"
        ? Math.round((eu - 31) * 2) / 2
        : Math.round((eu - 33) * 2) / 2;
    recs.push({
      category: "shoes",
      recommendedSize: `EU ${eu}`,
      secondarySize: `US ${us}`,
      basis: `Your saved shoe size`,
      fitNote: null,
    });
  } else {
    // estimate from height
    const eu = Math.round(avatar.heightCm * 0.25);
    recs.push({
      category: "shoes",
      recommendedSize: `EU ${eu}`,
      secondarySize: null,
      basis: `Estimated from height ${avatar.heightCm} cm — add your shoe size for accuracy`,
      fitNote: null,
    });
  }

  return recs;
}
