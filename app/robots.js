export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/private/'],
      },
      // Googlebot ke liye specific
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: '/private/',
      },
    ],
    sitemap: 'https://samruddhigroupofindustries.com/sitemap.xml',
  }
}