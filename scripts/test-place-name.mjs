import { formatTownName } from "../place-name.js";

const cases = [
  ["Township of Coolbaugh, PA", "Coolbaugh, PA"],
  ["Township of Tobyhanna, PA", "Tobyhanna, PA"],
  ["Township of Towamensing, PA", "Towamensing, PA"],
  ["Charter Township of West Bloomfield, MI", "West Bloomfield, MI"],
  ["Borough of Media, PA", "Media, PA"],
  ["City of Boston, MA", "Boston, MA"],
  ["Town of Westfield, NJ", "Westfield, NJ"],
  ["Coolbaugh Township, PA", "Coolbaugh, PA"],
  ["Tobyhanna Township, PA", "Tobyhanna, PA"],
  ["Jersey City, NJ", "Jersey City, NJ"],
  ["Westfield, NJ", "Westfield, NJ"],
  ["Boston, MA", "Boston, MA"],
  ["Coolbaugh, PA", "Coolbaugh, PA"],
];

for (const [input, expected] of cases) {
  const got = formatTownName(input);
  if (got !== expected) {
    throw new Error(`${input} → ${got}, expected ${expected}`);
  }
}

if (formatTownName("Township of Coolbaugh, PA") !== formatTownName("Coolbaugh Township, PA")) {
  throw new Error("prefix and suffix forms should match");
}

if (formatTownName("") !== "") throw new Error("empty name");

console.log("place-name tests passed");
