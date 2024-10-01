import { GraphQLClient, PageInfo } from '@sitecore-jss/sitecore-jss/graphql';
import { debug } from '@sitecore-jss/sitecore-jss';
import { GraphQLRequestClientFactory } from '@sitecore-jss/sitecore-jss-nextjs/graphql';
import { SitemapData, SitemapItem } from '..';

/** @private */
export const languageEmptyError = 'The list of languages cannot be empty';
export const siteError = 'The service needs a site name';

/**
 * Configuration options for @see GraphQLSitemapService instances
 */
export interface SitemapServiceConfig extends Omit<SitemapQueryVariables, 'language'> {
  /**
   * A GraphQL Request Client Factory is a function that accepts configuration and returns an instance of a GraphQLRequestClient.
   * This factory function is used to create and configure GraphQL clients for making GraphQL API requests.
   */
  clientFactory?: GraphQLRequestClientFactory;
}

/**
 * type for input variables for the site routes query
 */
interface SitemapQueryVariables {
  /**
   * Required. The languages to include in the result set.
   */
  language: string;

  /**
   * Required. The name of the site
   */
  siteName: string;

  /** common variable for all GraphQL queries
   * it will be used for every type of query to regulate result batch size
   * Optional. How many result items to fetch in each GraphQL call. This is needed for pagination.
   * @default 100
   */
  pageSize?: number;
}

export interface SitemapQueryResult {
  site: {
    siteInfo: {
      routes: {
        total: number;
        pageInfo: PageInfo;
        results: SitemapQueryRouteResult[];
      };
    };
  };
}

export interface SitemapQueryRouteResult {
  route: {
    path: string;
    template: {
      name: string;
    };
    updated: {
      value: string;
    };
    url: {
      path: string;
      hostName: string;
    };
    changeFrequency: Enum;
  };
}

/**
 * Object model of a enum dropdown
 */
export type Enum = {
  targetItem: {
    field: {
      value: string;
    };
  };
};

export class GraphQLSitemapService {
  private _graphQLClient: GraphQLClient;

  private query = `query sitemap(
  $siteName: String!
  $language: String = "en"
  $pageSize: Int = 100
  $after: String = ""
) {
  site {
    siteInfo(site: $siteName) {
      routes(language: $language, first: $pageSize, after: $after) {
        total
        pageInfo {
          endCursor
          hasNext
        }
        results {
          route {
            path
            template {
              name
            }
           updated: field(name: "__Updated") {
              value
            }
            url {
              path
            }
            ... on _Sitemap {
              changeFrequency {
                ...enumVal
              }
            }
          }
        }
      }
    }
  }
}

fragment enumVal on LookupField {
  targetItem {
    field(name: "value") {
      value
    }
  }
}`;

  /**
   * Creates an instance of graphQL sitemap service with the provided options
   * @param {SitemapServiceConfig} options instance
   */
  constructor(public options: SitemapServiceConfig) {
    this.options = options;
    this._graphQLClient = this.getGraphQLClient();
  }

  public async getAllSitemapItems(languages: string[]): Promise<SitemapData> {
    const rawData: SitemapData = {};

    //Can't use a map() here as it's not async safe
    for (const lang of languages) {
      rawData[lang] = [];
      rawData[lang] = await this.getSitemapItems(lang);
    }

    //Last thing to do is to make it a dictionary of item, not of languages
    const finalSitemapData = this.invertSitemapToItems(rawData);

    return finalSitemapData;
  }

  protected async getSitemapItems(language: string): Promise<SitemapItem[]> {
    const allSitemapData: SitemapItem[] = [];

    debug.sitemapxml('Fetching sitemap data for %s', language);

    await this.getSitemapItemsForLanguage(language).then((res) => {
      debug.sitemapxml('Fetch results outer [%s]: %o', language, res);

      res
        .filter((langItem) => {
          return langItem?.route?.changeFrequency?.targetItem?.field?.value !== 'DoNotInclude';
        })
        .map((langItem) => {
          allSitemapData.push({
            itemPath: langItem.route.path,
            path: langItem.route.url.path,
            lastModified: this.getDate(langItem.route?.updated.value),
            template: langItem.route?.template.name,
            language: language,
            final: { shouldProcess: true, url: '' },
          });
        });

      debug.sitemapxml('Done mapping [%s]: %o', language, allSitemapData);
    });

    debug.sitemapxml('Full data [%s]: %o', language, allSitemapData);

    return allSitemapData;
  }

  protected async getSitemapItemsForLanguage(language: string): Promise<SitemapQueryRouteResult[]> {
    const args: SitemapQueryVariables = {
      language: language,
      siteName: this.options.siteName,
      pageSize: this.options.pageSize,
    };

    let results: SitemapQueryRouteResult[] = [];
    let hasNext = true;
    let after = '';

    while (hasNext) {
      const fetchResponse = await this._graphQLClient.request<SitemapQueryResult>(this.query, {
        ...args,
        after,
      });

      results = results.concat(fetchResponse.site.siteInfo.routes.results);
      hasNext = fetchResponse.site.siteInfo.routes.pageInfo.hasNext;
      after = fetchResponse.site.siteInfo.routes.pageInfo.endCursor;
    }

    return results;
  }

  /*
// Inverts the data to be Item Path based, not language based.  We use the Path so we can sort it (Evenyone loves the homepage to be on page 1)
*/
  protected invertSitemapToItems(data: SitemapData): SitemapData {
    const unsortedData: SitemapData = {};

    debug.sitemapxml('Inverting Sitemap');

    for (const language in data) {
      const sitemapItem = data[language];

      sitemapItem.map((sitemapEntry) => {
        if (!unsortedData[sitemapEntry.itemPath]) unsortedData[sitemapEntry.itemPath] = [];

        unsortedData[sitemapEntry.itemPath].push(sitemapEntry);
      });
    }

    const allKeys = Object.keys(unsortedData);

    allKeys.sort();

    const sortedData: SitemapData = {};

    for (let i = 0; i < allKeys.length; i++) {
      sortedData[allKeys[i]] = unsortedData[allKeys[i]];
    }

    return sortedData;
  }

  protected getDate(dateString: string): Date {
    const date = new Date();

    date.setUTCFullYear(
      Number(dateString.substring(0, 4)),
      Number(dateString.substring(4, 6)) - 1,
      Number(dateString.substring(6, 8))
    );

    return date;
  }

  protected getGraphQLClient(): GraphQLClient {
    if (!this.options.clientFactory) {
      throw new Error('You should provide a clientFactory.');
    }

    return this.options.clientFactory({
      debugger: debug.sitemapxml,
    });
  }
}
