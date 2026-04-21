import { runScreenwriter } from '../agents/screenwriter.js';

const url = process.argv[2];
if (!url) {
  console.error("URL required");
  process.exit(1);
}

runScreenwriter(url).then(res => {
  console.log(JSON.stringify(res));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
