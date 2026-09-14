import BlogArticle from "@/components/blog/BlogArticle";
import { H2, Item, List, P } from "@/components/blog/Prose";
import { getPost, postMetadata } from "@/lib/blog";

const post = getPost("why-menopause-weight-goes-to-your-belly");
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogArticle
      post={post}
      answer={`Because estrogen used to send fat to your hips and thighs. As it drops, your body starts storing new fat around your middle instead, including deeper fat around your organs. Stress, poor sleep and losing muscle all push the same way. You can't burn it off one spot with crunches, but a daily walk, strength work, protein and sleep all help shrink it.`}
    >
      <P>{`One of the strangest parts of menopause is looking in the mirror and seeing a shape you don't recognize. Your hips and thighs look about the same. But your waist, the part that always stayed fairly flat, is suddenly soft and round. Sometimes the scale has barely moved at all.`}</P>
      <P>{`If that's you, I want you to know two things. It's extremely common. And it's not because you've let yourself go.`}</P>

      <H2>{`Estrogen used to decide where fat went`}</H2>
      <P>{`For most of your adult life, estrogen acted like a traffic controller for fat. It sent it to your hips, thighs and bottom. That's the classic pear shape, and it's there for a reason: those stores were set aside for pregnancy and breastfeeding.`}</P>
      <P>{`When estrogen drops in menopause, that traffic controller steps back. New fat gets stored around your middle instead, the way it tends to be in men. Your body shifts from a pear toward an apple. Nothing about your eating has to change for this to happen.`}</P>

      <H2>{`Not all belly fat is the same`}</H2>
      <P>{`There are two kinds of fat around your middle. One sits just under your skin, the part you can pinch. The other sits deeper, packed around your organs. You can't see it or pinch it, but it's the kind that grows most after menopause.`}</P>
      <P>{`That deeper fat is the one doctors care about, because it's linked to heart health and blood sugar. So this is about more than how your jeans fit. The good news is that it's also the kind that responds best when you start moving more.`}</P>

      <H2>{`Three things that make it worse`}</H2>
      <P>{`Estrogen starts it, but it isn't working alone.`}</P>
      <List>
        <Item title="Stress.">{`Your main stress hormone also tells your body to store fat around your middle. Menopause often lands in the busiest years of your life, so a lot of women are running on stress without noticing.`}</Item>
        <Item title="Poor sleep.">{`Night sweats and early waking leave you hungrier the next day and craving quick energy. More snacks, more storage, and now it's stored at your waist.`}</Item>
        <Item title="Losing muscle.">{`Less muscle means your body burns less at rest, so there's more energy left over to store.`}</Item>
      </List>

      <H2>{`Why crunches won't fix it`}</H2>
      <P>{`This is the myth I'd love to put to rest. You can't burn fat off one spot by working the muscles underneath it. A hundred crunches make your stomach muscles stronger, which is good, but they don't burn the fat sitting on top.`}</P>
      <P>{`Your body decides where fat comes off, and it takes it from all over. What you control is whether it's coming off at all.`}</P>

      <H2>{`What actually shrinks it`}</H2>
      <List>
        <Item title="Walk every day.">{`Regular brisk walking is one of the best-studied ways to reduce deep belly fat, even when the scale barely moves. Go at a pace where you could talk but not sing.`}</Item>
        <Item title="Build muscle two or three times a week.">{`Squats, lunges, push-ups against a wall or kitchen counter. More muscle means your body burns more at rest, so less gets stored.`}</Item>
        <Item title="Eat protein at every meal.">{`It keeps you full, which makes the afternoon snack easier to skip, and it feeds the muscle you're building.`}</Item>
        <Item title="Go easy on alcohol.">{`It's easy extra energy for your body to store, and it tends to make night sweats and sleep worse.`}</Item>
        <Item title="Protect your sleep.">{`The same wake-up time every day, a cool room and a short wind-down before bed.`}</Item>
      </List>
      <P>{`None of these is dramatic on its own. Done most days, together, they work on every reason your belly is growing, not just one.`}</P>

      <H2>{`How to know it's working`}</H2>
      <P>{`Your scale may be the slowest thing to change, especially if you're building muscle at the same time. So grab a tape measure instead. Wrap it around your middle just above your hip bones, once a week, at the same time of day.`}</P>
      <P>{`Doctors often use 35 inches as the point where a woman's waist is worth working on. Wherever you're starting, a smaller number there, and clothes that fit better at the waist, tell you more than the scale ever will.`}</P>
      <P>{`And if your belly is growing fast, or it comes with bloating that won't go away, see your doctor rather than guessing.`}</P>
    </BlogArticle>
  );
}
