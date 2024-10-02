import type { NextApiRequest, NextApiResponse } from 'next';

import { siteResolver } from 'lib/site-resolver';
import { GraphQLSitemapService } from '../../lib/sitemap-xml/services/graphql-sitemapxml-service';
import { debug } from '@sitecore-jss/sitecore-jss';
import clientFactory from 'lib/graphql-client-factory';
import processSitemap, { SitemapData, SitemapConfiguration } from 'lib/sitemap-xml';

const sitemapApi = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<NextApiResponse | void> => {
  //Make sure we're actually looking for a sitemap
  console.log(req.url);

  const sitemapRegex = new RegExp('/sitemap-?(\\d+)?.xml', 'i');
  let sitemapCurrentPage = 0;

  if (!sitemapRegex.test(req.url as string)) {
    console.error("Tried to fetch a sitemap that didn't match format: " + req.url);
    return res.redirect('/404');
  }

  //Attempt to extract a page number (e.g sitemap-01.xml or sitemap-1.xml.  sitemap.xml will result in a value of 0.)
  if (sitemapRegex.exec(req.url as string)) {
    const match = sitemapRegex.exec(req.url as string);
    if (match?.length && match.length == 2 && !isNaN(Number(match[1] as string))) {
      sitemapCurrentPage = Number(match[1] as string);

      debug.sitemapxml('Matched sitemap page: %d', sitemapCurrentPage);
    }
  }

  let hostName = '';

  debug.sitemapxml('Starting Sitemap XML Generation');
  const start = Date.now();

  //Sometimes the hostname might not be in the host header. Let's check if we need to look there.
  if (process.env.SITEMAP_HOST_HEADER) {
    hostName = (req.headers[process.env.SITEMAP_HOST_HEADER] as string)?.split(':')[0];
  } else {
    hostName = req.headers['host']?.split(':')[0] || 'localhost';
  }

  //It may seem redundant to do this twice, but the first one has some magic of wildcard matching
  const site = siteResolver.getByHost(hostName);

  const sitemapConfig: SitemapConfiguration = {};

  //Set some defaults. Can always be overridden later
  sitemapConfig['hostname'] = hostName;
  sitemapConfig['languages'] = 'en';
  sitemapConfig['default_language'] = 'en';
  sitemapConfig['include_alternate_links'] = 'true';
  sitemapConfig['include_x_default'] = 'true';
  sitemapConfig['href_lang_mode'] = 'language-and-region';

  //console.log(process.env);

  Object.keys(process.env).forEach((k) => {
    const keyCased = k.toLowerCase();

    if (keyCased.startsWith('sitemapxml_')) {
      debug.sitemapxml('Creating setting: [%s] = %s', keyCased.substring(11), process.env[k]);

      sitemapConfig[keyCased.substring(11)] = process.env[k] as string;
    }
  });

  const sitemapXmlService = new GraphQLSitemapService({
    clientFactory: clientFactory,
    siteName: site.name,
  });

  const allSitemapURLs = await sitemapXmlService.getAllSitemapItems(
    sitemapConfig['languages']?.split('|') || ['en']
  );

  debug.sitemapxml('%d sitemap items returned', Object.keys(allSitemapURLs).length);

  //Invoke our plugin to process these items, setting the final URL
  const processedSitemapURLs = await processSitemap(allSitemapURLs, sitemapConfig);

  const sitemapURLCount = Object.keys(processedSitemapURLs).length;

  debug.sitemapxml('Processed Data Length: %d', sitemapURLCount);

  let maxURLsPerSitemap = 0;

  if (
    sitemapConfig['max_pages_per_sitemap'] &&
    !isNaN(Number(sitemapConfig['max_pages_per_sitemap']))
  ) {
    maxURLsPerSitemap = Number(sitemapConfig['max_pages_per_sitemap']);

    debug.sitemapxml('Paged Sitemap: [%s pages per sitemap]', maxURLsPerSitemap);
  }

  let sitemapContents = '';

  debug.sitemapxml(
    'Entering Logic Switches: [%d URLs Rendered][%d Max URLs per Page][%d Current Page][(%s) Incoming URl]',
    sitemapURLCount,
    maxURLsPerSitemap,
    sitemapCurrentPage,
    req.url
  );
  if (maxURLsPerSitemap == 0) {
    //There is no limit to the pages in the sitemap

    if (sitemapCurrentPage == 0) {
      //No max per page, render it all
      debug.sitemapxml('Default rendering. %d items', sitemapURLCount);

      sitemapContents = buildSitemap(processedSitemapURLs, sitemapConfig);
    } else {
      console.error('Tried to render a sitemap page when paging was disabled');

      //We aren't paging our sitemap, but we requested a page...
      return res.redirect('/404');
    }
  } else {
    //We have a limit on the number of pages we can render in a sitemap!
    if (sitemapURLCount > maxURLsPerSitemap) {
      const sitemapPageCount =
        sitemapURLCount % maxURLsPerSitemap == 0
          ? sitemapURLCount / maxURLsPerSitemap
          : sitemapURLCount / maxURLsPerSitemap + 1;

      if (sitemapCurrentPage == 0 && sitemapPageCount > 0) {
        //We're not looking for a specific page, show the index
        debug.sitemapxml('Generating Sitemap Index for %d pages', sitemapPageCount);

        sitemapContents = buildSitemapIndex(sitemapPageCount, sitemapConfig['hostname']);
      } else if (sitemapCurrentPage > 0 && sitemapCurrentPage <= sitemapPageCount) {
        //We're looking for a specific page, and it's valid

        let start = (sitemapCurrentPage - 1) * maxURLsPerSitemap - 1;

        if (start < 0) start = 0;
        const selectSitemapURls = Object.fromEntries(
          Object.entries(processedSitemapURLs).slice(start, start + maxURLsPerSitemap)
        );

        sitemapContents = buildSitemap(selectSitemapURls, sitemapConfig);
      } else if (sitemapCurrentPage > 0 && sitemapCurrentPage > sitemapPageCount) {
        //We're looking for a specific page, and it's outside the count of pages we have
        console.error(
          `Tried to retrieve an invalid page number: ${sitemapCurrentPage}. Max pages: ${sitemapPageCount}.`
        );
        return res.redirect('/404');
      }
    }
  }

  debug.sitemapxml('Ending Sitemap XML Generation: %dms', Date.now() - start);

  res.setHeader('Content-Type', 'text/xml;charset=utf-8');

  return res.send(sitemapContents);
};

const buildSitemap = (pages: SitemapData, config: SitemapConfiguration): string => {
  const opening = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
      config['include_alternate_links']?.toLowerCase() == 'true'
        ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
        : ''
    }>`,
    closing = '</urlset>';

  let sitemapPagesContent = '';

  for (const pageId in pages) {
    config['languages'].split('|').forEach((language) => {
      //Find the page instance
      const page = pages[pageId].find((p) => p.language == language);

      if (page) {
        sitemapPagesContent += `<url><loc>https://${config['hostname']}${
          page?.final.url
        }</loc><lastmod>${page?.lastModified.toISOString().split('T')[0]}</lastmod>`;

        //If we need alternate links, we'll iterate through all language except the current
        if (config['include_alternate_links']?.toLowerCase() == 'true') {
          const altPages = pages[pageId].filter((p) => p.language != language);

          altPages.map((p) => {
            let langDisplay = p.language;

            if (p.language.length === 5 && config['href_lang_mode'] !== 'language-and-region') {
              if (config['href_lang_mode'] === 'language-only')
                langDisplay = p.language.substring(0, 2);

              if (config['href_lang_mode'] === 'region-only')
                langDisplay = p.language.substring(3, 5);
            }

            sitemapPagesContent += `<xhtml:link rel="alternate" hreflang="${langDisplay}" href="https://${config['hostname']}${p.final.url}" />`;
          });

          //Including the x-default alternate adds in an item based off the default language
          if (config['include_x_default'] == 'true') {
            const defaultPage = pages[pageId].find((p) => p.language == config['default_language']);

            if (defaultPage) {
              sitemapPagesContent += `<xhtml:link rel="alternate" hreflang="x-default" href="https://${config['hostname']}${defaultPage.final.url}" />`;
            }
          }
        }

        sitemapPagesContent += '</url>';
      }
    });
  }

  return opening + sitemapPagesContent + closing;
};

const buildSitemapIndex = (pages: number, hostName: string): string => {
  const opening = '<sitemapindex xmlns="http://sitemaps.org/schemas/sitemap/0.9" encoding="UTF-8">',
    closing = '</sitemapindex>';

  let sitemaps = '';

  for (let page = 1; page <= pages; page++) {
    sitemaps += `<sitemap><loc>https://${hostName}/sitemap-${String(page).padStart(
      2,
      '0'
    )}.xml</loc></sitemap>`;
  }

  return opening + sitemaps + closing;
};

export default sitemapApi;
