/**
 * Window chrome tokens (the TS side of `--wb-sidebar-strip` / `--wb-title-strip` in
 * _own.sass). macOS: the native title bar is taken over (transparent, content runs under
 * it, no title) and the traffic lights sit inside the 80px left strip, centred in the
 * 32px title strip. Keep these in step with the Sass tokens.
 */
export const SIDEBAR_STRIP = 80;
export const TITLE_STRIP = 32;
export const TRAFFIC_LIGHT = { x: 14, y: 10 } as const;

export const window_chrome = process.platform === 'darwin' || process.env.FRACTALGPUI_CUSTOM_CHROME === '1'
	? { titlebarTransparent: true, trafficLightX: TRAFFIC_LIGHT.x, trafficLightY: TRAFFIC_LIGHT.y }
	: {};
