import { PrismaClient } from "@prisma/client";

// Imported, not redefined: seeded rows and runtime lookups must normalise
// identically or the catalogue becomes unfindable. See src/normalize.ts.
import { normalize } from "../src/normalize.js";

const prisma = new PrismaClient();

const CATALOGUE: Array<{ name: string; unit: string; price: number }> = [
  { name: "Rice", unit: "kg", price: 300 },
  { name: "Sugar", unit: "kg", price: 100 },
  // "Oil", not "Cooking Oil": the owner says "oil", and the catalogue name is
  // what lookup_product matches against.
  { name: "Oil", unit: "litre", price: 500 },
  // Ghee is deliberately NOT seeded. The proposal's worked example (Figure 3)
  // has lookup_product("ghee") miss, so the owner is offered the new-product
  // sub-loop and adds it at 1200 per kg. Seeding it would break that demo.
  { name: "Flour", unit: "kg", price: 120 },
  { name: "Lentils", unit: "kg", price: 250 },
  { name: "Chickpeas", unit: "kg", price: 280 },
  { name: "Tea", unit: "packet", price: 450 },
  { name: "Milk", unit: "litre", price: 220 },
  { name: "Eggs", unit: "dozen", price: 330 },
  { name: "Salt", unit: "kg", price: 60 },
  { name: "Red Chilli Powder", unit: "kg", price: 800 },
  { name: "Turmeric", unit: "kg", price: 600 },
  { name: "Onion", unit: "kg", price: 80 },
  { name: "Potato", unit: "kg", price: 70 },
  { name: "Tomato", unit: "kg", price: 120 },
  { name: "Soap", unit: "piece", price: 150 },
  { name: "Shampoo", unit: "bottle", price: 350 },
  { name: "Washing Powder", unit: "kg", price: 400 },
  { name: "Biscuits", unit: "packet", price: 100 },
  { name: "Bread", unit: "piece", price: 180 },
];

async function main() {
  for (const item of CATALOGUE) {
    // Upsert on normalizedName so re-running the seed never duplicates rows.
    await prisma.product.upsert({
      where: { normalizedName: normalize(item.name) },
      update: { unit: item.unit, currentPrice: item.price },
      create: {
        name: item.name,
        normalizedName: normalize(item.name),
        unit: item.unit,
        currentPrice: item.price,
      },
    });
  }

  const count = await prisma.product.count();
  console.log(`Seeded catalogue. products table now holds ${count} rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
