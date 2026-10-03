/** Stock React inputs, listed in the left sidebar; also the regression suite's first cases. */

export interface Sample {
	id: string;
	title: string;
	source: string;
}

export const SAMPLES: Sample[] = [
	{
		id: 'greeting',
		title: 'Greeting: props and defaults',
		source: `interface GreetingProps { name: string; excited?: boolean }
export default function Greeting({ name, excited = false }: GreetingProps) {
  return <h1 className="title">Hello, {name}{excited ? '!' : '.'}</h1>;
}
`
	},
	{
		id: 'counter',
		title: 'Counter: state and events',
		source: `import { useState } from 'react';
export default function Counter({ step = 1 }) {
  const [count, setCount] = useState(0);
  return (
    <div className="counter" style={{ marginTop: 8, opacity: 0.9 }}>
      <button onClick={() => setCount(c => c - step)} disabled={count <= 0}>-</button>
      <span>{count}</span>
      <button onClick={() => setCount(count + step)}>+</button>
    </div>
  );
}
`
	},
	{
		id: 'todos',
		title: 'Todo list: each, bind, derived',
		source: `import { useState, useMemo } from 'react';
type Todo = { id: number; text: string; done: boolean };
export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const visible = useMemo(() => filter === 'all' ? todos : todos.filter(t => !t.done), [todos, filter]);
  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setTodos(prev => [...prev, { id: Date.now(), text, done: false }]);
    setText('');
  }
  return (
    <form onSubmit={add}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="New todo" />
      <label htmlFor="f"><input id="f" type="checkbox" checked={filter === 'open'} onChange={() => setFilter(filter === 'all' ? 'open' : 'all')} /> Open only</label>
      {visible.length === 0 && <p className="empty">Nothing to do</p>}
      <ul>
        {visible.map(t => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            <input type="checkbox" checked={t.done} onChange={() => setTodos(todos.map(x => x.id === t.id ? { ...x, done: !x.done } : x))} />
            {t.text}
          </li>
        ))}
      </ul>
      <p>{todos.filter(t => !t.done).length} left</p>
    </form>
  );
}
`
	},
	{
		id: 'timer',
		title: 'Timer: effects and refs',
		source: `import { useState, useEffect, useRef, useCallback } from 'react';
export default function Timer({ autoStart = true }: { autoStart?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(autoStart);
  const intervalRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);
  useEffect(() => { document.title = \`\${seconds}s\`; }, [seconds]);
  const reset = useCallback(() => { setSeconds(0); inputRef.current?.focus(); }, []);
  return (
    <div>
      <input ref={inputRef} readOnly value={seconds} />
      <button onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Start'}</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
`
	},
	{
		id: 'card',
		title: 'Card: children and rest props',
		source: `import React from 'react';
type CardProps = { title: string; footer?: React.ReactNode; children: React.ReactNode; variant?: 'plain' | 'bordered'; onClose?: () => void };
export function Card({ title, footer, children, variant = 'plain', onClose, ...rest }: CardProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={\`card card-\${variant}\`} {...rest}>
      <header>
        <h2>{title}</h2>
        {onClose && <button aria-label="Close" onClick={onClose}>×</button>}
      </header>
      <>{children}</>
      {footer ? <footer>{footer}</footer> : null}
    </section>
  );
}
`
	},
	{
		id: 'users',
		title: 'User list: fetch and early returns',
		source: `import { useEffect, useState, useContext } from 'react';
import { ThemeContext } from './theme';
import Avatar from './Avatar';
type User = { id: string; name: string; email: string };
export default function UserList({ endpoint }: { endpoint: string }) {
  const theme = useContext(ThemeContext);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint).then(r => r.json()).then(d => { if (!cancelled) { setUsers(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [endpoint]);
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  return (
    <ul className={theme.dark ? 'dark' : 'light'}>
      {users.map((u, i) => {
        const initials = u.name.split(' ').map(p => p[0]).join('');
        return (
          <li key={u.id}>
            <Avatar initials={initials} size={32} onClick={() => alert(u.email)} />
            <span>{i + 1}. {u.name}</span>
            {u.email.endsWith('.org') ? <em>org</em> : <small>{u.email}</small>}
          </li>
        );
      })}
    </ul>
  );
}
`
	},
	{
		id: 'table',
		title: 'Data table: forwardRef and reducer',
		source: `import { useReducer, forwardRef } from 'react';
type Row = Record<string, string | number>;
type Col = { key: string; label: string; render?: (row: Row) => React.ReactNode };
type State = { sortKey: string | null; asc: boolean };
function reducer(s: State, a: { type: 'sort'; key: string }): State {
  return s.sortKey === a.key ? { ...s, asc: !s.asc } : { sortKey: a.key, asc: true };
}
const DataTable = forwardRef<HTMLTableElement, { rows: Row[]; columns: Col[]; renderEmpty?: () => React.ReactNode }>(function DataTable({ rows, columns, renderEmpty }, ref) {
  const [state, dispatch] = useReducer(reducer, { sortKey: null, asc: true });
  const sorted = state.sortKey ? [...rows].sort((a, b) => (a[state.sortKey!] > b[state.sortKey!] ? 1 : -1) * (state.asc ? 1 : -1)) : rows;
  return (
    <table ref={ref}>
      <thead><tr>{columns.map(c => <th key={c.key} onClick={() => dispatch({ type: 'sort', key: c.key })}>{c.label}{state.sortKey === c.key && (state.asc ? ' ▲' : ' ▼')}</th>)}</tr></thead>
      <tbody>
        {sorted.length === 0 ? <tr><td colSpan={columns.length}>{renderEmpty?.() ?? 'No rows'}</td></tr> :
          sorted.map((r, i) => <tr key={i}>{columns.map(c => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}
      </tbody>
    </table>
  );
});
export default DataTable;
`
	},
	{
		id: 'search',
		title: 'Search: CSS-in-JS and render props',
		source: `import styled from 'styled-components';
import { useState } from 'react';
import { useDebounce } from './hooks';
const Box = styled.div\`padding: 12px; border: 1px solid #ccc;\`;
export default function Search({ onSearch, renderItem }: { onSearch: (q: string) => string[]; renderItem: (s: string) => JSX.Element }) {
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const results = onSearch(debounced);
  return (
    <Box>
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Escape' && setQ('')} />
      {results.length > 0 || q === '' ? null : <p>No results for “{q}”</p>}
      {results.map(r => <div key={r}>{renderItem(r)}</div>)}
      <List items={results}>{(item) => <b>{item}</b>}</List>
      <p dangerouslySetInnerHTML={{ __html: '<i>hint</i>' }} />
    </Box>
  );
}
`
	}
];
