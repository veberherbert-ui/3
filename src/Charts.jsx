/* Обёртки над библиотекой графиков.

   Recharts — половина всего кода приложения, а нужна только на двух вкладках
   из пяти. Она вынесена сюда, чтобы грузиться отдельным куском: первый запуск
   становится заметно легче, а на вкладках с графиками подгрузка происходит
   один раз и дальше берётся из кеша. */

import React from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C } from "./lib/theme.js";

const axis = { stroke: C.dim, fontSize: 10, tickLine: false };
const tooltip = {
  contentStyle: { background: C.surfaceHi, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: C.chalk },
};

/** График по датам: одна линия выбранной метрики. */
export function LineByDate({ data, dataKey, name, color = C.red, height = 200, domain = ["auto", "auto"] }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...axis} axisLine={{ stroke: C.line }} />
        <YAxis {...axis} axisLine={false} domain={domain} />
        <Tooltip {...tooltip} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Столбцы по датам — тоннаж за тренировку. */
export function BarByDate({ data, dataKey, name, color = C.blue, height = 230 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...axis} axisLine={{ stroke: C.line }} />
        <YAxis {...axis} axisLine={false} />
        <Tooltip {...tooltip} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
