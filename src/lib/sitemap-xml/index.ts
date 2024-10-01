import { GraphQLRequestClientFactory } from '@sitecore-jss/sitecore-jss-nextjs/graphql';
import { debug } from '@sitecore-jss/sitecore-jss';
import * as plugins from 'temp/sitemapxml-plugins';

export interface SitemapData {
  [itemid: string]: SitemapItem[];
}

export interface SitemapItem {
  itemPath: string;
  path: string;
  lastModified: Date;
  template: string;
  language: string;
  final: {
    url: string;
    //Whether or not we should continue to process this item
    shouldProcess: boolean;
  };
}

export interface SitemapConfiguration {
  [key: string]: string;
}

export interface SitemapXmlPlugin {
  /**
   * Detect order when the plugin should be called, e.g. 0 - will be called first (can be a plugin which data is required for other plugins)
   */
  order: number;
  /**
   * A middleware to be called, it's required to return @type {SitemapData} for other middlewares
   */
  process(
    siteData: SitemapData,
    config?: SitemapConfiguration,
    clientFactory?: GraphQLRequestClientFactory
  ): SitemapData;
}

export default async function processSitemap(
  data: SitemapData,
  config: SitemapConfiguration
): Promise<SitemapData> {
  debug.sitemapxml('processSitemap start');

  const start = Date.now();

  //Process all plugins
  (Object.values(plugins) as SitemapXmlPlugin[])
    .sort((p1, p2) => p1.order - p2.order)
    .forEach((p) => p.process(data, config));

  debug.sitemapxml('processSitemap in %dms', Date.now() - start);

  return data;
}
