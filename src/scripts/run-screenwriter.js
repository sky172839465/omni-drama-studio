import { runScreenwriter } from '../agents/screenwriter.js';

const url = process.argv[2];
const maximumVideoDuration = process.argv[3] || "5";

if (!url) {
  console.error("URL required");
  process.exit(1);
}

runScreenwriter(url, maximumVideoDuration).then(res => {
  console.log(JSON.stringify(res));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
