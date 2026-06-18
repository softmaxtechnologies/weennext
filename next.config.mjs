/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/product/:slug',
        destination: '/?product=:slug',
      },
    ];
  },
};

export default nextConfig;






// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   /* config options here */
// };

// export default nextConfig;
