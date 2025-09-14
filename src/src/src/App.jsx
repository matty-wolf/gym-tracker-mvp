import React, { useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2, Calendar as CalIcon, RotateCcw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const LS_KEY = "gymTrackerMVP:v1";
const SPLIT = [
  "Day 1 – Chest + Side Delts",
  "Day 2 – Legs",
  "Day 3 – Forearms + Cardio",
  "Day 4 – Chest + Triceps",
  "Day 5 – Back + Biceps",
  "Day 6 – Rest",
  "Day 7 – Shoulders",
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const toISO = (d) => new Date(d).toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}
function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export default function App() {
  const [tab, setTab] = useState("today");
  const [state, setState] = useState(() => loadState() || {
    startDate: todayISO(),
    settings: { kcalTarget: 0, p: 0, c: 0, f: 0 },
    workouts: [],
    meals: [],
    supps: [],
    reviews: [],
  });

  useEffect(() => { saveState(state); }, [state]);

  const dayIndexFromStart = (dateStr) => {
    const start = new Date(state.startDate);
    const d = new Date(dateStr);
    const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24));
    const idx = ((diffDays % 7) + 7) % 7;
    return idx + 1;
  };

  const today = todayISO();
  const todayDayIndex = dayIndexFromStart(today);

  const getWorkoutByDate = (dateStr) => state.workouts.find(w => w.date === dateStr) || null;
  const ensureWorkout = (dateStr) => {
    const existing = getWorkoutByDate(dateStr);
    if (existing) return existing;
    const w = { id: uid(), date: dateStr, dayIndex: dayIndexFromStart(dateStr), notes: "", exercises: [], cardio: [] };
    setState(s => ({ ...s, workouts: [...s.workouts, w] }));
    return w;
  };

  const addExercise = (dateStr) => {
    const w = ensureWorkout(dateStr);
    const ex = { id: uid(), name: "", sets: [] };
    setState(s => ({ ...s, workouts: s.workouts.map(W => W.id === w.id ? { ...W, exercises: [...W.exercises, ex] } : W) }));
  };
  const addSet = (dateStr, exId) => {
    const w = ensureWorkout(dateStr);
    setState(s => ({
      ...s,
      workouts: s.workouts.map(W => {
        if (W.id !== w.id) return W;
        return {
          ...W,
          exercises: W.exercises.map(ex => ex.id === exId ? {
            ...ex,
            sets: [...ex.sets, { id: uid(), reps: 0, weight: 0, rpe: 8 }]
          } : ex)
        };
      })
    }));
  };
  const removeExercise = (dateStr, exId) => {
    const w = ensureWorkout(dateStr);
    setState(s => ({
      ...s,
      workouts: s.workouts.map(W => W.id === w.id ? { ...W, exercises: W.exercises.filter(ex => ex.id !== exId) } : W)
    }));
  };
  const addCardio = (dateStr) => {
    const w = ensureWorkout(dateStr);
    const c = { id: uid(), type: "Steady", duration: 30, distance: 0, hr: 0 };
    setState(s => ({ ...s, workouts: s.workouts.map(W => W.id === w.id ? { ...W, cardio: [...W.cardio, c] } : W) }));
  };

  const addMeal = (dateStr) => {
    const meal = { id: uid(), date: dateStr, name: "Meal", kcal: 0, protein: 0, carbs: 0, fat: 0 };
    setState(s => ({ ...s, meals: [...s.meals, meal] }));
  };
  const mealsForDate = (d) => state.meals.filter(m => m.date === d);
  const dayMacros = (d) => mealsForDate(d).reduce((acc, m) => ({
    kcal: acc.kcal + (+m.kcal||0),
    p: acc.p + (+m.protein||0),
    c: acc.c + (+m.carbs||0),
    f: acc.f + (+m.fat||0),
  }), { kcal:0,p:0,c:0,f:0 });

  const getSupps = (d) => state.supps.find(x => x.date === d) || null;
  const ensureSupps = (d) => {
    const s0 = getSupps(d);
    if (s0) return s0;
    const sRec = { id: uid(), date: d, creatine_g: 5, pre: false, casein: false, whey: false };
    setState(s => ({ ...s, supps: [...s.supps, sRec] }));
    return sRec;
  };

  const weekStartISO = (d) => {
    const _d = new Date(d);
    const start = new Date(state.startDate);
    const diff = Math.floor((_d - start)/(1000*60*60*24));
    const wStart = new Date(start);
    wStart.setDate(start.getDate() + Math.floor(diff/7)*7);
    return toISO(wStart);
  };
  const getReview = (d) => state.reviews.find(r => r.weekStart === weekStartISO(d)) || null;
  const ensureReview = (d) => {
    const r = getReview(d);
    if (r) return r;
    const rec = { id: uid(), weekStart: weekStartISO(d), wins:["","",""], fail:"" };
    setState(s => ({ ...s, reviews: [...s.reviews, rec] }));
    return rec;
  };

  const sessionVolume = (w) => w.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s2, st) => s2 + (+st.weight||0) * (+st.reps||0), 0), 0);
  const weeklyVolumeData = useMemo(() => {
    const map = new Map();
    state.workouts.forEach(w => {
      const wk = weekStartISO(w.date);
      map.set(wk, (map.get(wk)||0) + sessionVolume(w));
    });
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([wk, vol]) => ({ week: wk, volume: Math.round(vol) }));
  }, [state.workouts]);

  const exportCSV = () => {
    const esc = (s) => '"' + String(s??"").replaceAll('"','""') + '"';
    const rows = [];
    rows.push(["type","date","dayIndex","name","set_num","weight","reps","rpe","notes"]);
    state.workouts.forEach(w => {
      w.exercises.forEach(ex => {
        if (ex.sets.length === 0) rows.push(["workout", w.date, w.dayIndex, ex.name, "", "", "", "", w.notes]);
        ex.sets.forEach((st, i) => rows.push(["workout", w.date, w.dayIndex, ex.name, i+1, st.weight, st.reps, st.rpe, w.notes]));
      });
      w.cardio.forEach(c => rows.push(["cardio", w.date, w.dayIndex, c.type, "", c.duration, c.distance, c.hr, ""]));
    });
    rows.push(["type","date","name","kcal","protein","carbs","fat"]);
    state.meals.forEach(m => rows.push(["meal", m.date, m.name, m.kcal, m.protein, m.carbs, m.fat]));
    rows.push(["type","date","creatine_g","pre","casein","whey"]);
    state.supps.forEach(su => rows.push(["supps", su.date, su.creatine_g, su.pre, su.casein, su.whey]));
    const csv = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "gym_tracker_export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    if (!confirm("Reset all local data?")) return;
    const fresh = { startDate: todayISO(), settings:{kcalTarget:0,p:0,c:0,f:0}, workouts:[], meals:[], supps:[], reviews:[] };
    setState(fresh);
  };

  const TabBtn = ({ id, label }) => (
    <button onClick={()=>setTab(id)} className={`px-3 py-2 rounded-xl text-sm font-medium border ${tab===id?"bg-black text-white":"bg-white"}`}>
      {label}
    </button>
  );
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Gym Tracker MVP</h1>
          <p className="text-sm text-gray-500">7-day split • offline-first • local only</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} className="px-3 py-2 rounded-xl border flex items-center gap-2"><Download size={16}/>Export CSV</button>
          <button onClick={resetAll} className="px-3 py-2 rounded-xl border flex items-center gap-2"><RotateCcw size={16}/>Reset</button>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap mb-4">
        <TabBtn id="today" label="Today"/>
        <TabBtn id="workout" label="Workouts"/>
        <TabBtn id="nutrition" label="Nutrition"/>
        <TabBtn id="supps" label="Supps"/>
        <TabBtn id="review" label="Weekly Review"/>
        <TabBtn id="history" label="History"/>
        <TabBtn id="progress" label="Progress"/>
        <TabBtn id="settings" label="Settings"/>
      </div>

      {tab === "settings" && (
        <section className="grid md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-2xl">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><CalIcon size={16}/> Split Start</h2>
            <div className="flex gap-3 items-end">
              <Labeled label="Start date">
                <input type="date" className="border rounded-xl px-3 py-2" value={state.startDate}
                  onChange={e=>setState(s=>({...s, startDate:e.target.value}))}/>
              </Labeled>
              <div className="text-sm text-gray-500">Today is {toISO(new Date())}. Day {todayDayIndex} of split.</div>
            </div>
          </div>
          <div className="p-4 border rounded-2xl">
            <h2 className="font-semibold mb-3">Nutrition Targets</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Labeled label="Calories (kcal)"><input type="number" className="border rounded-xl px-3 py-2" value={state.settings.kcalTarget} onChange={e=>setState(s=>({...s, settings:{...s.settings, kcalTarget:+e.target.value}}))}/></Labeled>
              <Labeled label="Protein (g)"><input type="number" className="border rounded-xl px-3 py-2" value={state.settings.p} onChange={e=>setState(s=>({...s, settings:{...s.settings, p:+e.target.value}}))}/></Labeled>
              <Labeled label="Carbs (g)"><input type="number" className="border rounded-xl px-3 py-2" value={state.settings.c} onChange={e=>setState(s=>({...s, settings:{...s.settings, c:+e.target.value}}))}/></Labeled>
              <Labeled label="Fat (g)"><input type="number" className="border rounded-xl px-3 py-2" value={state.settings.f} onChange={e=>setState(s=>({...s, settings:{...s.settings, f:+e.target.value}}))}/></Labeled>
            </div>
          </div>
        </section>
      )}

      {tab === "today" && (
        <section className="grid md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-2xl">
            <h2 className="font-semibold mb-1">Today • {today} • {SPLIT[todayDayIndex-1]}</h2>
            <TodayWorkoutCard date={today} state={state} setState={setState} addExercise={addExercise} addSet={addSet} removeExercise={removeExercise} addCardio={addCardio} />
          </div>
          <div className="p-4 border rounded-2xl">
            <h2 className="font-semibold mb-3">Today • Nutrition & Supps</h2>
            <TodayNutritionCard date={today} state={state} setState={setState} addMeal={addMeal} dayMacros={dayMacros} />
            <div className="h-3"/>
            <TodaySuppsCard date={today} state={state} setState={setState} ensureSupps={ensureSupps} />
          </div>
        </section>
      )}

      {tab === "workout" && (
        <section className="p-4 border rounded-2xl">
          <h2 className="font-semibold mb-3">Workouts</h2>
          <WorkoutEditor state={state} setState={setState} addExercise={addExercise} addSet={addSet} removeExercise={removeExercise} addCardio={addCardio} dayIndexFromStart={dayIndexFromStart} />
        </section>
      )}

      {tab === "nutrition" && (
        <section className="p-4 border rounded-2xl">
          <h2 className="font-semibold mb-3">Nutrition</h2>
          <NutritionEditor state={state} setState={setState} addMeal={addMeal} dayMacros={dayMacros} />
        </section>
      )}

      {tab === "supps" && (
        <section className="p-4 border rounded-2xl">
          <h2 className="font-semibold mb-3">Supplements</h2>
          <SuppsEditor state={state} setState={setState} ensureSupps={ensureSupps} />
        </section>
      )}

      {tab === "review" && (
        <section className="p-4 border rounded-2xl">
          <h2 className="font-semibold mb-3">Weekly Review (3 wins / 1 fail)</h2>
          <WeeklyReview state={state} setState={setState} ensureReview={ensureReview} />
        </section>
      )}

      {tab === "history" && (
        <section className="p-4 border rounded-2xl">
          <h2 className="font-semibold mb-3">History</h2>
          <History state={state} />
        </section>
      )}

      {tab === "progress" && (
        <section className="p-4 border rounded-2xl">
          <h2 className="font-semibold mb-3">Weekly Volume</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyVolumeData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" fontSize={12}/>
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="volume" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">Volume = Σ(weight × reps) per week.</p>
        </section>
      )}

      <footer className="text-center text-xs text-gray-400 mt-6">Local data only • Export to back up • MVP</footer>
    </div>
  );
}

function TodayWorkoutCard({ date, state, setState, addExercise, addSet, removeExercise, addCardio }) {
  const w = state.workouts.find(x => x.date === date) || { dayIndex: 1, exercises: [], cardio: [], notes: "" };
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <button onClick={()=>addExercise(date)} className="px-3 py-2 rounded-xl border flex items-center gap-2"><Plus size={16}/>Add exercise</button>
        <button onClick={()=>addCardio(date)} className="px-3 py-2 rounded-xl border">Add cardio</button>
      </div>
      {w.exercises.length === 0 && w.cardio.length === 0 && (
        <p className="text-sm text-gray-500">No entries yet.</p>
      )}
      {w.exercises.map(ex => (
        <div key={ex.id} className="border rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <input className="border rounded-xl px-3 py-2 w-full" placeholder="Exercise name" value={ex.name}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, exercises:W.exercises.map(E=>E.id===ex.id?{...E, name:e.target.value}:E)}:W)}))}/>
            <button onClick={()=>removeExercise(date, ex.id)} className="p-2 rounded-xl border" title="Remove exercise"><Trash2 size={16}/></button>
          </div>
          <div className="mt-2 space-y-2">
            {ex.sets.map(st => (
              <div key={st.id} className="grid grid-cols-12 gap-2 items-center">
                <Labeled label="Wt"><input type="number" className="border rounded-xl px-2 py-1 col-span-3" value={st.weight}
                  onChange={e=>setState(s=>({
                    ...s,
                    workouts: s.workouts.map(W=>W.date===date?{...W,exercises:W.exercises.map(E=>E.id===ex.id?{...E, sets:E.sets.map(S=>S.id===st.id?{...S, weight:+e.target.value}:S)}:E)}:W)
                  }))}/></Labeled>
                <Labeled label="Reps"><input type="number" className="border rounded-xl px-2 py-1 col-span-3" value={st.reps}
                  onChange={e=>setState(s=>({
                    ...s,
                    workouts: s.workouts.map(W=>W.date===date?{...W,exercises:W.exercises.map(E=>E.id===ex.id?{...E, sets:E.sets.map(S=>S.id===st.id?{...S, reps:+e.target.value}:S)}:E)}:W)
                  }))}/></Labeled>
                <Labeled label="RPE"><input type="number" min={5} max={10} className="border rounded-xl px-2 py-1 col-span-3" value={st.rpe}
                  onChange={e=>setState(s=>({
                    ...s,
                    workouts: s.workouts.map(W=>W.date===date?{...W,exercises:W.exercises.map(E=>E.id===ex.id?{...E, sets:E.sets.map(S=>S.id===st.id?{...S, rpe:clamp(+e.target.value,5,10)}:S)}:E)}:W)
                  }))}/></Labeled>
              </div>
            ))}
            <button onClick={()=>addSet(date, ex.id)} className="px-3 py-1 rounded-xl border text-sm">Add set</button>
          </div>
        </div>
      ))}
      {w.cardio.map(c => (
        <div key={c.id} className="border rounded-2xl p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Labeled label="Type"><input className="border rounded-xl px-3 py-2" value={c.type}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, type:e.target.value}:C)}:W)}))}/></Labeled>
            <Labeled label="Duration (min)"><input type="number" className="border rounded-xl px-3 py-2" value={c.duration}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, duration:+e.target.value}:C)}:W)}))}/></Labeled>
            <Labeled label="Distance (km)"><input type="number" className="border rounded-xl px-3 py-2" value={c.distance}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, distance:+e.target.value}:C)}:W)}))}/></Labeled>
            <Labeled label="Avg HR"><input type="number" className="border rounded-xl px-3 py-2" value={c.hr}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, hr:+e.target.value}:C)}:W)}))}/></Labeled>
          </div>
        </div>
      ))}
      <Labeled label="Notes">
        <textarea className="border rounded-xl px-3 py-2 w-full" rows={3} value={w.notes}
          onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, notes:e.target.value}:W)}))}/>
      </Labeled>
    </div>
  );
}

function TodayNutritionCard({ date, state, setState, addMeal, dayMacros }) {
  const meals = state.meals.filter(m => m.date === date);
  const totals = dayMacros(date);
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <button onClick={()=>addMeal(date)} className="px-3 py-2 rounded-xl border flex items-center gap-2"><Plus size={16}/>Add meal</button>
      </div>
      {meals.length === 0 && (<p className="text-sm text-gray-500">No meals yet.</p>)}
      {meals.map(m => (
        <div key={m.id} className="border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <Labeled label="Name"><input className="border rounded-xl px-3 py-2" value={m.name} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, name:e.target.value}:M)}))}/></Labeled>
          <Labeled label="kcal"><input type="number" className="border rounded-xl px-3 py-2" value={m.kcal} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, kcal:+e.target.value}:M)}))}/></Labeled>
          <Labeled label="P (g)"><input type="number" className="border rounded-xl px-3 py-2" value={m.protein} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, protein:+e.target.value}:M)}))}/></Labeled>
          <Labeled label="C (g)"><input type="number" className="border rounded-xl px-3 py-2" value={m.carbs} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, carbs:+e.target.value}:M)}))}/></Labeled>
          <Labeled label="F (g)"><input type="number" className="border rounded-xl px-3 py-2" value={m.fat} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, fat:+e.target.value}:M)}))}/></Labeled>
          <button onClick={()=>setState(s=>({...s, meals:s.meals.filter(M=>M.id!==m.id)}))} className="px-3 py-2 rounded-xl border flex items-center gap-2 justify-center"><Trash2 size={16}/>Del</button>
        </div>
      ))}
      <div className="text-sm grid grid-cols-4 gap-2">
        <div className="p-2 border rounded-xl">kcal: <b>{totals.kcal}</b> / {state.settings.kcalTarget||"—"}</div>
        <div className="p-2 border rounded-xl">P: <b>{totals.p}</b> / {state.settings.p||"—"}</div>
        <div className="p-2 border rounded-xl">C: <b>{totals.c}</b> / {state.settings.c||"—"}</div>
        <div className="p-2 border rounded-xl">F: <b>{totals.f}</b> / {state.settings.f||"—"}</div>
      </div>
    </div>
  );
}

function TodaySuppsCard({ date, state, setState, ensureSupps }) {
  const s0 = state.supps.find(x => x.date === date) || ensureSupps(date);
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
      <Labeled label="Creatine (g)"><input type="number" className="border rounded-xl px-3 py-2" value={s0.creatine_g} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, creatine_g:+e.target.value}:S)}))}/></Labeled>
      <Labeled label="Pre-workout"><input type="checkbox" className="w-5 h-5" checked={s0.pre} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, pre:e.target.checked}:S)}))}/></Labeled>
      <Labeled label="Casein"><input type="checkbox" className="w-5 h-5" checked={s0.casein} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, casein:e.target.checked}:S)}))}/></Labeled>
      <Labeled label="Whey"><input type="checkbox" className="w-5 h-5" checked={s0.whey} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, whey:e.target.checked}:S)}))}/></Labeled>
      <div className="text-sm text-gray-500">Saved automatically</div>
    </div>
  );
}

function WorkoutEditor({ state, setState, addExercise, addSet, removeExercise, addCardio, dayIndexFromStart }) {
  const [date, setDate] = useState(todayISO());
  const dayIdx = dayIndexFromStart(date);
  const w = state.workouts.find(x => x.date === date) || { id:null, date, dayIndex:dayIdx, notes:"", exercises:[], cardio:[] };
  const createIfMissing = () => {
    if (!w.id) {
      const nw = { id: uid(), date, dayIndex: dayIdx, notes: "", exercises: [], cardio: [] };
      setState(s => ({ ...s, workouts: [...s.workouts, nw] }));
    }
  };
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <Labeled label="Date"><input type="date" className="border rounded-xl px-3 py-2" value={date} onChange={e=>setDate(e.target.value)}/></Labeled>
        <div className="p-2 border rounded-xl">{SPLIT[dayIdx-1]}</div>
        <button onClick={()=>{createIfMissing(); addExercise(date);}} className="px-3 py-2 rounded-xl border flex items-center gap-2"><Plus size={16}/>Add exercise</button>
        <button onClick={()=>{createIfMissing(); addCardio(date);}} className="px-3 py-2 rounded-xl border">Add cardio</button>
        <div className="text-sm text-gray-500">Autosave</div>
      </div>
      {w.exercises.map(ex => (
        <div key={ex.id} className="border rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <input className="border rounded-xl px-3 py-2 w-full" placeholder="Exercise name" value={ex.name}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, exercises:W.exercises.map(E=>E.id===ex.id?{...E, name:e.target.value}:E)}:W)}))}/>
            <button onClick={()=>removeExercise(date, ex.id)} className="p-2 rounded-xl border" title="Remove exercise"><Trash2 size={16}/></button>
          </div>
          <div className="mt-2 space-y-2">
            {ex.sets.map(st => (
              <div key={st.id} className="grid grid-cols-12 gap-2 items-center">
                <Labeled label="Wt"><input type="number" className="border rounded-xl px-2 py-1 col-span-3" value={st.weight}
                  onChange={e=>setState(s=>({
                    ...s,
                    workouts: s.workouts.map(W=>W.date===date?{...W,exercises:W.exercises.map(E=>E.id===ex.id?{...E, sets:E.sets.map(S=>S.id===st.id?{...S, weight:+e.target.value}:S)}:E)}:W)
                  }))}/></Labeled>
                <Labeled label="Reps"><input type="number" className="border rounded-xl px-2 py-1 col-span-3" value={st.reps}
                  onChange={e=>setState(s=>({
                    ...s,
                    workouts: s.workouts.map(W=>W.date===date?{...W,exercises:W.exercises.map(E=>E.id===ex.id?{...E, sets:E.sets.map(S=>S.id===st.id?{...S, reps:+e.target.value}:S)}:E)}:W)
                  }))}/></Labeled>
                <Labeled label="RPE"><input type="number" min={5} max={10} className="border rounded-xl px-2 py-1 col-span-3" value={st.rpe}
                  onChange={e=>setState(s=>({
                    ...s,
                    workouts: s.workouts.map(W=>W.date===date?{...W,exercises:W.exercises.map(E=>E.id===ex.id?{...E, sets:E.sets.map(S=>S.id===st.id?{...S, rpe:clamp(+e.target.value,5,10)}:S)}:E)}:W)
                  }))}/></Labeled>
              </div>
            ))}
            <button onClick={()=>addSet(date, ex.id)} className="px-3 py-1 rounded-xl border text-sm">Add set</button>
          </div>
        </div>
      ))}
      {w.cardio.map(c => (
        <div key={c.id} className="border rounded-2xl p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Labeled label="Type"><input className="border rounded-xl px-3 py-2" value={c.type}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, type:e.target.value}:C)}:W)}))}/></Labeled>
            <Labeled label="Duration (min)"><input type="number" className="border rounded-xl px-3 py-2" value={c.duration}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, duration:+e.target.value}:C)}:W)}))}/></Labeled>
            <Labeled label="Distance (km)"><input type="number" className="border rounded-xl px-3 py-2" value={c.distance}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, distance:+e.target.value}:C)}:W)}))}/></Labeled>
            <Labeled label="Avg HR"><input type="number" className="border rounded-xl px-3 py-2" value={c.hr}
              onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, cardio:W.cardio.map(C=>C.id===c.id?{...C, hr:+e.target.value}:C)}:W)}))}/></Labeled>
          </div>
        </div>
      ))}
      <Labeled label="Notes">
        <textarea className="border rounded-xl px-3 py-2 w-full" rows={3} value={w.notes}
          onChange={e=>setState(s=>({...s, workouts:s.workouts.map(W=>W.date===date?{...W, notes:e.target.value}:W)}))}/>
      </Labeled>
    </div>
  );
}

function NutritionEditor({ state, setState, addMeal, dayMacros }) {
  const [date, setDate] = useState(todayISO());
  const meals = state.meals.filter(m => m.date === date);
  const totals = dayMacros(date);
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <Labeled label="Date"><input type="date" className="border rounded-xl px-3 py-2" value={date} onChange={e=>setDate(e.target.value)}/></Labeled>
        <button onClick={()=>addMeal(date)} className="px-3 py-2 rounded-xl border flex items-center gap-2"><Plus size={16}/>Add meal</button>
      </div>
      {meals.length===0 && <p className="text-sm text-gray-500">No meals yet.</p>}
      {meals.map(m => (
        <div key={m.id} className="border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <Labeled label="Name"><input className="border rounded-xl px-3 py-2" value={m.name} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, name:e.target.value}:M)}))}/></Labeled>
          <Labeled label="kcal"><input type="number" className="border rounded-xl px-3 py-2" value={m.kcal} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, kcal:+e.target.value}:M)}))}/></Labeled>
          <Labeled label="P"><input type="number" className="border rounded-xl px-3 py-2" value={m.protein} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, protein:+e.target.value}:M)}))}/></Labeled>
          <Labeled label="C"><input type="number" className="border rounded-xl px-3 py-2" value={m.carbs} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, carbs:+e.target.value}:M)}))}/></Labeled>
          <Labeled label="F"><input type="number" className="border rounded-xl px-3 py-2" value={m.fat} onChange={e=>setState(s=>({...s, meals:s.meals.map(M=>M.id===m.id?{...M, fat:+e.target.value}:M)}))}/></Labeled>
          <button onClick={()=>setState(s=>({...s, meals:s.meals.filter(M=>M.id!==m.id)}))} className="px-3 py-2 rounded-xl border flex items-center gap-2 justify-center"><Trash2 size={16}/>Del</button>
        </div>
      ))}
      <div className="text-sm grid grid-cols-4 gap-2">
        <div className="p-2 border rounded-xl">kcal: <b>{totals.kcal}</b> / {state.settings.kcalTarget||"—"}</div>
        <div className="p-2 border rounded-xl">P: <b>{totals.p}</b> / {state.settings.p||"—"}</div>
        <div className="p-2 border rounded-xl">C: <b>{totals.c}</b> / {state.settings.c||"—"}</div>
        <div className="p-2 border rounded-xl">F: <b>{totals.f}</b> / {state.settings.f||"—"}</div>
      </div>
    </div>
  );
}

function SuppsEditor({ state, setState, ensureSupps }) {
  const [date, setDate] = useState(todayISO());
  const s0 = state.supps.find(x => x.date === date) || ensureSupps(date);
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <Labeled label="Date"><input type="date" className="border rounded-xl px-3 py-2" value={date} onChange={e=>setDate(e.target.value)}/></Labeled>
      </div>
      <div className="border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <Labeled label="Creatine (g)"><input type="number" className="border rounded-xl px-3 py-2" value={s0.creatine_g} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, creatine_g:+e.target.value}:S)}))}/></Labeled>
        <Labeled label="Pre-workout"><input type="checkbox" className="w-5 h-5" checked={s0.pre} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, pre:e.target.checked}:S)}))}/></Labeled>
        <Labeled label="Casein"><input type="checkbox" className="w-5 h-5" checked={s0.casein} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, casein:e.target.checked}:S)}))}/></Labeled>
        <Labeled label="Whey"><input type="checkbox" className="w-5 h-5" checked={s0.whey} onChange={e=>setState(s=>({...s, supps:s.supps.map(S=>S.id===s0.id?{...S, whey:e.target.checked}:S)}))}/></Labeled>
        <div className="text-sm text-gray-500">Saved automatically</div>
      </div>
    </div>
  );
}

function WeeklyReview({ state, setState, ensureReview }) {
  const [date, setDate] = useState(todayISO());
  const r0 = state.reviews.find(r => r.weekStart === (ensureReview(date).weekStart)) || ensureReview(date);
  const Labeled = ({label, children}) => (<label className="text-sm font-medium flex flex-col gap-1">{label}{children}</label>);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <Labeled label="Any date in the week"><input type="date" className="border rounded-xl px-3 py-2" value={date} onChange={e=>setDate(e.target.value)}/></Labeled>
        <div className="p-2 border rounded-xl">Week start: {r0.weekStart}</div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="border rounded-2xl p-3 space-y-2">
          <h3 className="font-semibold">3 Wins</h3>
          {r0.wins.map((w,i)=> (
            <input key={i} className="border rounded-xl px-3 py-2 w-full" value={w}
              onChange={e=>setState(s=>({...s, reviews:s.reviews.map(R=>R.id===r0.id?{...R, wins:R.wins.map((x,ii)=>ii===i?e.target.value:x)}:R)}))}/>
          ))}
        </div>
        <div className="border rounded-2xl p-3">
          <h3 className="font-semibold">1 Fail</h3>
          <textarea className="border rounded-xl px-3 py-2 w-full" rows={4} value={r0.fail}
            onChange={e=>setState(s=>({...s, reviews:s.reviews.map(R=>R.id===r0.id?{...R, fail:e.target.value}:R)}))}/>
        </div>
      </div>
    </div>
  );
}

function History({ state }) {
  const workouts = [...state.workouts].sort((a,b)=>a.date.localeCompare(b.date));
  return (
    <div className="space-y-3">
      {workouts.length===0 && <p className="text-sm text-gray-500">No sessions yet.</p>}
      {workouts.map(w => (
        <div key={w.id} className="border rounded-2xl p-3">
          <div className="font-medium">{w.date} • {SPLIT[w.dayIndex-1]}</div>
          <div className="text-sm text-gray-500">Volume: {w.exercises.reduce((sum, ex)=> sum + ex.sets.reduce((s2, st)=> s2 + (+st.weight||0)*(+st.reps||0), 0), 0)}</div>
          <div className="mt-2 grid md:grid-cols-2 gap-2">
            {w.exercises.map(ex => (
              <div key={ex.id} className="border rounded-xl p-2">
                <div className="font-medium">{ex.name || "(unnamed)"}</div>
                <div className="text-xs text-gray-500">{ex.sets.length} sets</div>
              </div>
            ))}
          </div>
          {w.cardio.length>0 && (
            <div className="mt-2 text-sm">Cardio: {w.cardio.map(c=>`${c.type} ${c.duration}m`).join(", ")}</div>
          )}
          {w.notes && <p className="mt-2 text-sm">Notes: {w.notes}</p>}
        </div>
      ))}
    </div>
  );
}
