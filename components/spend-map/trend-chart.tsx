"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { SpendingLocationItem } from "@/lib/types";

interface TrendChartProps {
  top3: SpendingLocationItem[];
  isLoading: boolean;
}

export function TrendChart({ top3, isLoading }: TrendChartProps) {
  if (isLoading || !top3 || top3.length === 0) return null;

  // ÇÖZÜM 1: İsimleri biraz kısalttık ki X eksenine rahatça sığsınlar ve gizlenmesinler.
  const chartData = [
    { name: "Prev. Year" },
    { name: "Prev. Qtr" },
    { name: "Current" },
  ];

  const locations = top3.map((item) => item.location);

  // Dashboard renk paletimiz
  const colors = ["#f7b8a1", "#7fb2d6", "#8ce0c2"];

  top3.forEach((item) => {
    // @ts-ignore
    chartData[0][item.location] = item.prev_year_spend || 0;
    // @ts-ignore
    chartData[1][item.location] = item.prev_period_spend || 0;
    // @ts-ignore
    chartData[2][item.location] = Number(item.spend) || 0;
  });

  return (
    <div className="rounded-lg border border-[#2a3441] bg-[#111724] overflow-hidden shadow-inner mt-6">
      <div className="flex items-center gap-2 px-4 py-3 bg-[#151c2c] border-b border-[#2a3441]">
        <BarChart3 className="h-4 w-4 text-[#8fa0b5]" />
        <span className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider">
          Performance Trend
        </span>
      </div>

      <div className="p-4 h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* ÇÖZÜM 1 EK: Yazıların altı kesilmesin diye bottom margin'i 0'dan 5'e çıkardık */}
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#2a3441"
              vertical={false}
            />

            <XAxis
              dataKey="name"
              stroke="#8fa0b5"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#2a3441" }}
            />

            <YAxis
              stroke="#8fa0b5"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
            />

            <Tooltip
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name,
              ]}
              cursor={{ fill: "#1a2332" }}
              contentStyle={{
                backgroundColor: "#151c2c",
                border: "1px solid #2a3441",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
              itemStyle={{ color: "#e2e8f0" }}
            />

            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
              iconType="circle"
            />

            {locations.map((loc, index) => (
              <Bar
                key={loc}
                dataKey={loc}
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
                barSize={12}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
