import { createCaller } from './src/server/routers.ts';
const c = createCaller();
console.log('before:', (await c.actions.list()).length);
const r = await c.actions.create({ name: 'Log in (script)', dsl: JSON.stringify({ steps: [{ type: 'fill', locator: { role: 'textbox' }, value: '' }] }) });
console.log('created:', r.id);
const after = await c.actions.list();
console.log('after:', after.length, after.map(a => a.name));
