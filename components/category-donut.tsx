"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { CATEGORY_META } from "@/lib/categories";
import { formatMoney } from "@/lib/format";
import type { MovementCategory } from "@/lib/types";

export interface CategorySlice {
  category: MovementCategory;
  total: number;
}

export function CategoryDonut({
  slices,
  total,
}: {
  slices: CategorySlice[];
  total: number;
}) {
  if (slices.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-ink-300">
        Todavía no hay gastos para mostrar.
      </p>
    );
  }

  return (
    <div>
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="category"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={2}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              animationDuration={650}
            >
              {slices.map((slice) => (
                <Cell key={slice.category} fill={CATEGORY_META[slice.category].color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* El total va en el centro del anillo, no como leyenda aparte. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-300">
            Gastado
          </span>
          <span className="tabular text-xl font-extrabold text-ink-900">
            {formatMoney(total)}
          </span>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {slices.map((slice) => {
          const meta = CATEGORY_META[slice.category];
          const pct = total > 0 ? Math.round((slice.total / total) * 100) : 0;
          return (
            <li key={slice.category} className="flex items-center gap-2.5">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span className="flex-1 text-sm font-bold text-ink-700">{meta.label}</span>
              <span className="text-xs font-semibold text-ink-300">{pct}%</span>
              <span className="tabular w-24 text-right text-sm font-extrabold text-ink-900">
                {formatMoney(slice.total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
