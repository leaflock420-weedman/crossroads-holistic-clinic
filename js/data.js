export const PRODUCTS = [
  {
    id: "vaporiser-mini",
    name: "Portable dry herb vaporiser",
    category: "Accessories",
    price: 89,
    image: "🌿",
    desc: "Compact device for prescribed dried herb.",
  },
  {
    id: "grinder",
    name: "Medical-grade grinder",
    category: "Accessories",
    price: 24,
    image: "⚙️",
    desc: "Aluminium grinder for consistent dosing.",
  },
  {
    id: "storage-jar",
    name: "UV storage jar",
    category: "Accessories",
    price: 18,
    image: "🫙",
    desc: "Airtight, light-protected storage.",
  },
  {
    id: "sleep-drops",
    name: "Magnesium sleep drops",
    category: "Wellness",
    price: 32,
    image: "💧",
    desc: "Complementary wellness — not a prescription product.",
  },
  {
    id: "calm-tea",
    name: "Calm routine tea blend",
    category: "Wellness",
    price: 22,
    image: "🍵",
    desc: "Caffeine-free evening blend.",
  },
  {
    id: "delivery-bag",
    name: "Insulated delivery bag",
    category: "Accessories",
    price: 15,
    image: "📦",
    desc: "Keeps pharmacy deliveries stable in transit.",
  },
];

export const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00",
];

export function getAvailableDates(count = 14) {
  const dates = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dates.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push({
        value: cursor.toISOString().slice(0, 10),
        label: cursor.toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      });
    }
  }
  return dates;
}

export const CLINICIANS = ["Dr Patel", "Dr Nguyen", "Nurse Alex Chen"];