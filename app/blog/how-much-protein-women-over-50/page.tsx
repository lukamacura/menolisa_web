import BlogArticle from "@/components/blog/BlogArticle";
import { H2, Item, List, P } from "@/components/blog/Prose";
import { getPost, postMetadata } from "@/lib/blog";

const post = getPost("how-much-protein-women-over-50");
export const metadata = postMetadata(post);

/*
 * The number is the plan's own nutrition row ("25-30g protein", three ticks a
 * day - `protein_25_30g` in lib/plan/catalog.ts). Gram counts for foods are
 * rounded, typical values and are labelled as rough on the page.
 */
export default function Page() {
  return (
    <BlogArticle
      post={post}
      answer={`Aim for about 25 to 30 grams of protein at each meal, three times a day. That's roughly 75 to 90 grams a day for most women. In real food, 25 grams is about a palm-sized piece of chicken or fish, or two eggs with half a cup of cottage cheese. Spreading it across your meals matters as much as the total.`}
    >
      <P>{`If you're over 50 and you've noticed you feel softer, weaker or more tired than you used to, protein is one of the first places I'd look. Not because it's trendy, but because it's the one thing your muscles can't rebuild without, and menopause makes muscle harder to keep.`}</P>
      <P>{`Let me give you the plain-English number first, and then explain why.`}</P>

      <H2>{`The number: 25 to 30 grams, at every meal`}</H2>
      <P>{`Here's what I'd aim for: about 25 to 30 grams of protein at breakfast, at lunch and at dinner. Added up, that's roughly 75 to 90 grams a day for most women. It's the same number we built into the MenoLisa plan, ticked off meal by meal.`}</P>
      <P>{`You may have seen a smaller number on food labels or in older guides. That figure was set as a minimum, to make sure people don't go short. Researchers who study aging suggest that people over 50 need more than that to hold on to their muscle.`}</P>
      <P>{`One caution: if you have kidney disease, check with your doctor before eating more protein.`}</P>

      <H2>{`Why you need more now than you did at 30`}</H2>
      <P>{`Two things change. First, estrogen helped protect your muscle, so as it drops you lose muscle faster. Second, as we get older our muscles respond less strongly to the protein we eat. You need a bigger helping at a meal to get the same rebuilding a younger body got from less.`}</P>
      <P>{`So the amount that kept you strong at 30 isn't enough to keep you strong at 55.`}</P>

      <H2>{`Why every meal, not just dinner`}</H2>
      <P>{`This is the part most women get wrong, and it's not your fault. A typical day looks like toast or cereal for breakfast, a light salad for lunch, and most of the day's protein at dinner.`}</P>
      <P>{`Your body can only use so much protein for muscle at one sitting. A big dinner doesn't make up for a breakfast with almost none. Three moderate servings spread through the day do what one big one can't.`}</P>
      <P>{`If you only change one thing, make it breakfast.`}</P>

      <H2>{`What 25 grams looks like`}</H2>
      <P>{`You don't need to weigh anything. These are rough numbers, and rough is fine:`}</P>
      <List>
        <Item title="A palm-sized piece of chicken, turkey or fish:">{`about 25 grams`}</Item>
        <Item title="A can of tuna:">{`about 20 to 25 grams`}</Item>
        <Item title="Two eggs:">{`about 12 grams`}</Item>
        <Item title="Half a cup of cottage cheese:">{`about 12 grams`}</Item>
        <Item title="A single-serve cup of plain Greek yogurt:">{`about 15 grams`}</Item>
        <Item title="A cup of cooked lentils or beans:">{`about 15 to 18 grams`}</Item>
        <Item title="A scoop of protein powder:">{`usually 20 to 25 grams (check the label)`}</Item>
      </List>
      <P>{`A few breakfasts that get you there: two eggs scrambled with half a cup of cottage cheese. Greek yogurt with a spoon of nut butter and berries, plus a boiled egg. Or a protein shake with a banana on a rushed morning.`}</P>

      <H2>{`Protein also helps with hunger`}</H2>
      <P>{`There's a bonus. Protein keeps you full longer than the same amount of bread or pasta. A breakfast with real protein in it often means no mid-morning cookie. For a lot of women, that alone makes eating well feel easier, without counting anything.`}</P>

      <H2>{`Protein can't do it alone`}</H2>
      <P>{`Protein is the building material. It doesn't build anything by itself. Your muscles need a reason to use it, and that reason is strength work: squats, lunges, push-ups against the wall, two or three times a week.`}</P>
      <P>{`Protein plus strength work is what keeps muscle. Either one on its own does much less. If you've been eating well and still feel yourself getting weaker, the missing piece is usually the second half.`}</P>
    </BlogArticle>
  );
}
