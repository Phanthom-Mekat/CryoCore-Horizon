# Mapbox maps

All geographic map components use Mapbox GL JS v3. The Chattogram overview,
Explore, Compare, and Evidence pages share `CaseMap`; the scene catalogue uses
`StudyMap`; glacier speed and calving-front pages share `SpeedMap`. Illustrative
SVG diagrams, charts, the Three.js orbital hero, and image-only radar viewers
retain their existing renderers.

## Local and deployment setup

Create `.env.local` in the Next.js repository root:

```dotenv
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token
```

Use a Mapbox public token, not an `sk.` secret token. Restrict its allowed URLs
to the development and deployed origins you use. This variable is intentionally
included in browser bundles. `.env.local` is ignored by Git; never commit real
tokens. Set the same variable in the hosting build environment and rebuild after
changing it. Restart `pnpm dev` after local configuration changes if needed.

Mapbox map loads use the configured account and its usage limits/billing.
NASA API keys and Earthdata Login do not authenticate Mapbox.

## Rendering and behavior

- Shared Mapbox Standard vector context uses day/night lighting matching the site
  theme. Lighting changes do not reload NASA image or GeoJSON sources.
- Maps support pan, zoom, keyboard navigation, scale bars, and camera controls.
  Tilt is illustrative; it does not turn radar observations into terrain heights.
- Compare synchronizes center, zoom, bearing, and pitch on both sides. Its swipe
  control and date selection continue to use real acquisition metadata.
- NASA quicklooks, division outlines, scene selection, source attribution, and
  evidence links remain separate from Mapbox context.
- Glacier PNGs use a geographic latitude/longitude grid. Rows are reprojected
  into Mercator for display; hover/tap values are sampled from the original grid.
  Outside the grid or in transparent pixels, no speed measurement is reported.
  A date transition never reads values from the previous date's raster.
- Missing configuration and map/network failures have readable states. Scene
  tables remain usable independently of the map. WebGL support is required.

Mapbox's logo and attribution controls remain visible. Public sources:
[Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/),
[Standard configuration](https://docs.mapbox.com/mapbox-gl-js/example/set-config-property/),
[react-map-gl](https://visgl.github.io/react-map-gl/docs).
