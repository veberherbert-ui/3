/* Обёртки над библиотекой графиков.

   Recharts — половина всего кода приложения, а нужна только там, где
   действительно рисуется линия: раскрытый график упражнения и динамика
   замеров. Всё остальное на вкладке «Графики» — столбики и полосы на CSS,
   им библиотека не нужна.

   Вынесено сюда, чтобы грузиться отдельным куском: первый запуск заметно
   легче, а подгрузка происходит один раз и дальше берётся из кеша. */

import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
