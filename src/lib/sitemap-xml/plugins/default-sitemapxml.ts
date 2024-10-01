import { SitemapData, SitemapXmlPlugin } from '..';

class DefaultSitemapXmlPlugin implements SitemapXmlPlugin {
  //It's the default, make it go last
  order = 9999;

  process(data: SitemapData): SitemapData {
    for (const itemPath in data) {
      data[itemPath]
        ?.filter((item) => item.final.shouldProcess)
        .forEach((item) => {
          item.final.url = item.path;
          item.final.shouldProcess = false;
        });
    }
    return data;
  }
}

export const defaultSitemapxmlPlugin = new DefaultSitemapXmlPlugin();
