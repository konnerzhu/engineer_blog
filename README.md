# Field Notes — Hugo blog starter

A bilingual, static personal blog built with Hugo. It includes an editorial homepage, English and Chinese content, category/tag pages, an archive, keyboard-friendly search, dark mode, RSS feeds, and a GitHub Pages deployment workflow.

## Run locally

Install [Hugo](https://gohugo.io/installation/) and run:

```sh
hugo server
```

Open the local address Hugo prints. The site is served at `/en/` and `/zh/`.

To regenerate the static site:

```sh
hugo --minify
```

The generated files are written to `public/`.

## Personalize it

1. Edit `title`, `baseURL`, author, email, GitHub profile, and accent color in `hugo.yaml`.
2. Replace the sample Markdown files under `content/en/posts/` and `content/zh/posts/` with your own articles. Each post starts with YAML front matter for its title, date, description, categories, and tags.
3. Update the About pages and the localized labels in `hugo.yaml`.
4. Change the sample artwork and styles in `static/css/site.css` to make the visual identity your own.

## Publish with GitHub Pages

Push this folder as the root of a GitHub repository, then select **Settings → Pages → Build and deployment → GitHub Actions**. The workflow in `.github/workflows/hugo.yaml` builds the site and deploys it on every push to `master`.

For a custom domain, update `baseURL` in `hugo.yaml`, set the domain in the repository's Pages settings, and create the DNS record with your provider. GitHub Pages custom-domain instructions: <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site>.

## Project structure

```text
content/                 English and Chinese pages and posts
layouts/                 Hugo templates and shared partials
static/css/site.css      Theme styles
static/js/site.js        Search and theme toggle
.github/workflows/       GitHub Pages deployment
```

The theme is intentionally kept inside the site so you can change the design without managing a separate theme dependency.
