import { runDesigner } from '../agents/designer.js';

const storyId = process.argv[2];
if (!storyId) {
  process.exit(1);
}

runDesigner(storyId).then(res => {
  console.log(JSON.stringify(res));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
