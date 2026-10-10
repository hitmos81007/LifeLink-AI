/**
 * Lifelink AI - Map & Carto Basemaps Configuration
 * Map display settings for synthetic prototype scenarios; no live dispatch feed is connected.
 */

export interface BasemapLayerConfig {
  id: string;
  name: string;
  url: string;
  subdomains: string;
  maxZoom: number;
  attribution: string;
  description: string;
}

export const BASEMAP_LAYERS: Record<string, BasemapLayerConfig> = {
  cartoVoyager: {
    id: 'cartoVoyager',
    name: 'CARTO Voyager (Day/Street)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    description: 'High-visibility street layout optimized for urban navigation'
  },
  cartoDark: {
    id: 'cartoDark',
    name: 'CARTO Dark Matter (Tactical/Night)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    description: 'Sleek dark command center palette with glowing emergency assets'
  },
  cartoPositron: {
    id: 'cartoPositron',
    name: 'CARTO Positron (Clean/Clinical)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    description: 'Minimalist high-contrast basemap for rapid triage visualization'
  },
  osmStandard: {
    id: 'osmStandard',
    name: 'OpenStreetMap (Public GIS)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    description: 'Direct global OpenStreetMap public tile servers'
  }
};

export const DEFAULT_BASEMAP = BASEMAP_LAYERS.osmStandard;
