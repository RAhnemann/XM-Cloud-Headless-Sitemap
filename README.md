## Requirements

- JSS 22.0.0 ([github](https://github.com/Sitecore/jss/releases/tag/v22.0.0))

## Setup

1. Copy files into your headless application. Typically this is under \src\APP_NAME
2. Install patch-package `npm i patch-package` and run `npm i` to apply the patch
3. Update `\src\APP_NAME\scripts\generate-plugins.ts` to configure the plugin generation

```
{
   distPath: 'src/temp/sitemapxml-plugins.ts',
   rootPath: 'src/lib/sitemap-xml/plugins',
   moduleType: ModuleType.ESM,
},
```

4. Build and Deploy.

## Configuration

The Headless Sitemap module is configured through environment variables on your rendering host. All variables start with `sitemapxml_` and are case-insensitive.

A list of settings is in the table below:
| Setting Name | Description | Default Value |
| --------------------------------------- | ------------------------------------------------------------------------------- | ----------------|
| hostname | The hostname to prepend to all URLS. <br><br>_Note: Do not include https._<br><br>Example: "www.rockpapersitecore.com" | Incoming hostname |
| languages | A pipe-separated list of languages to include in the XML.<br><br>Example: "en&#124;en-ca&#124;fr-ca" | "en" |
| default_language | When using the x-default hreflang, this language will be set if present in the item | "en" |
| include_alternate_links | Determines whether or not to render alternate links for each language version of the item |true |
| include_x_default | Determines whether or not to include the x-default alternate language | true|
| href_lang_mode |Determines how to render hreflang values<br><br>\_Note: Valid Values are "language-only", "region-only" or "language-and-region"\* | language-and-region |
