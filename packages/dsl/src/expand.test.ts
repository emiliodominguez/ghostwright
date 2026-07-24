import { describe, expect, it } from 'vitest';
import { expandActions, type Step } from './index';

const goto = (url: string): Step => ({ type: 'goto', url });

describe('expandActions', () => {
	it('replaces an actionRef with the action steps in place', async () => {
		const steps: Step[] = [goto('/a'), { type: 'actionRef', actionId: 'login' }, goto('/b')];
		const load = async (id: string) => (id === 'login' ? [goto('/login'), goto('/home')] : null);
		const out = await expandActions(steps, load);
		expect(out.map((s) => (s.type === 'goto' ? s.url : s.type))).toEqual(['/a', '/login', '/home', '/b']);
	});

	it('expands nested actions', async () => {
		const load = async (id: string) => (id === 'outer' ? [{ type: 'actionRef', actionId: 'inner' } as Step] : id === 'inner' ? [goto('/deep')] : null);
		const out = await expandActions([{ type: 'actionRef', actionId: 'outer' }], load);
		expect(out).toEqual([goto('/deep')]);
	});

	it('carries an actionRef condition onto its expanded steps', async () => {
		const load = async (id: string) => (id === 'login' ? [goto('/login'), goto('/home')] : null);
		const out = await expandActions([{ type: 'actionRef', actionId: 'login', condition: 'return needsLogin' }], load);
		expect(out.every((s) => (s as { condition?: string }).condition === 'return needsLogin')).toBe(true);
	});

	it('throws on a reference cycle (depth cap)', async () => {
		const load = async () => [{ type: 'actionRef', actionId: 'loop' } as Step];
		await expect(expandActions([{ type: 'actionRef', actionId: 'loop' }], load)).rejects.toThrow(/nesting/);
	});
});
