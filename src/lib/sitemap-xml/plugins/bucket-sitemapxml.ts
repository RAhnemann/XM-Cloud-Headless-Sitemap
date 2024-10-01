import { SitemapData, SitemapXmlPlugin } from '..';

class BucketSitemapXmlPlugin implements SitemapXmlPlugin {
  order = 1;

  process(data: SitemapData): SitemapData {
    for (const itemPath in data) {
      data[itemPath].map((item) => {
        if (item.template == 'Bucket Page' && item.final.shouldProcess) {
          const segments = item.path.split('/');

          //If our url is /buckets/a/b/page we want to remove the second to last and third to last segment
          if (segments.length >= 4) {
            segments.splice(segments.length - 3, 2);

            item.final.url = segments.join('/');
            item.final.shouldProcess = false;
          }
        }
      });
    }
    return data;
  }
}

export const bucketSitemapxmlPlugin = new BucketSitemapXmlPlugin();
