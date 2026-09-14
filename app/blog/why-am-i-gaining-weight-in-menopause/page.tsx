import BlogArticle from "@/components/blog/BlogArticle";
import { H2, Item, List, P } from "@/components/blog/Prose";
import { getPost, postMetadata } from "@/lib/blog";

const post = getPost("why-am-i-gaining-weight-in-menopause");
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogArticle
      post={post}
      answer={`Because the same food is landing in a different body. As estrogen drops, your brain nudges hunger up and your daily burn down, new fat goes to your middle, and you slowly lose muscle, the part of you that burns calories at rest. Your plate didn't change. Your body did, and that responds to the right daily habits.`}
    >
      <P>{`If you're reading this, I'm guessing you've already done the math. Same breakfast. Same portions. Same glass of wine on Friday. And still the number creeps up, and your jeans feel tighter at the waist. You're not imagining it, and you're not doing anything wrong.`}</P>
      <P>{`Weight is the number one thing women pick when our quiz asks which symptom is hitting them hardest. So I want to explain what's actually happening, in plain words, because most of us were never told.`}</P>

      <H2>{`Your body changed the rules, not you`}</H2>
      <P>{`For most of your life, eating the same meant staying about the same. Your body had a rhythm, and your meals fit it. Menopause changes that rhythm. Not overnight, and not in one big way, but in several small ways that all push in the same direction.`}</P>
      <P>{`A small change, every day, for a year, is how "I eat the same" turns into "why do I weigh more?"`}</P>

      <H2>{`Your brain is running on a new setting`}</H2>
      <P>{`There's a small part of your brain that works like a thermostat. It helps decide how hungry you feel, how warm you run and how much energy your body spends. For years, estrogen was one of the signals it listened to.`}</P>
      <P>{`When estrogen drops, that thermostat has to adjust. It's the same reason hot flashes happen. For a lot of women it means feeling a little hungrier, in a body that spends a little less. You won't notice it at any one meal. You notice it on the scale months later.`}</P>

      <H2>{`Your body stores fat in a new place`}</H2>
      <P>{`Before menopause, estrogen tends to send fat to your hips and thighs. With less of it, new fat is more likely to land around your belly. That's why the scale can barely move while your waist changes a lot.`}</P>

      <H2>{`You're quietly losing muscle`}</H2>
      <P>{`This is the one I wish every woman knew about. Muscle is your body's engine. It burns energy even while you sleep. From midlife, you lose a little every year unless you use it, and losing estrogen speeds that up.`}</P>
      <P>{`Less muscle means a smaller engine. Same fuel, smaller engine, more left over. And here's the good news hiding inside the bad: a large 2021 study of metabolism across the whole lifespan found it doesn't suddenly crash at 50. What drops is the muscle, and muscle is something you can build back at any age.`}</P>

      <H2>{`Tired, stressed bodies want more food`}</H2>
      <P>{`Night sweats and 3 a.m. wake-ups don't just leave you tired. When you sleep badly, your body makes more of the hormone that makes you hungry and less of the one that tells you you're full. You crave quick energy, like bread and sugar. Stress does something similar, and it nudges fat toward your middle too.`}</P>
      <P>{`So your meals might look exactly the same. The handful of crackers at 4 p.m. might be new.`}</P>

      <H2>{`And you're probably moving a bit less`}</H2>
      <P>{`When you're tired and your joints ache, you sit more, walk less and take the elevator. None of it feels like a big change. But everyday movement is a big part of what your body burns in a day, and it slips away quietly.`}</P>

      <H2>{`Why eating even less makes it worse`}</H2>
      <P>{`I understand the urge. The weight goes up, so you cut back. Skip breakfast. Halve the portions. Try the diet that worked at 35.`}</P>
      <P>{`The trouble is that cutting food hard, without using your muscles, takes muscle along with the fat. The engine gets even smaller, you get hungrier, and you end up back where you started, only more frustrated. That's the loop so many of us get stuck in. Eating less isn't the answer. Changing what you do with the body you have now is.`}</P>

      <H2>{`What actually helps`}</H2>
      <P>{`You don't need a gym, a special diet or hours a day. You need a few small things, done most days:`}</P>
      <List>
        <Item title="Use your muscles two or three times a week.">{`Squats to a chair, wall push-ups, carrying the groceries. Short and regular beats long and rare.`}</Item>
        <Item title="Walk every day.">{`At a pace where you could talk but not sing.`}</Item>
        <Item title="Eat protein at every meal.">{`About a palm-sized portion, so your muscles have something to rebuild with and you stay full longer.`}</Item>
        <Item title="Guard your sleep.">{`The same wake-up time every day, a cool room and a short wind-down.`}</Item>
        <Item title="Watch your waist, not only the scale.">{`When you build muscle, the scale can be slow while your clothes fit better.`}</Item>
      </List>
      <P>{`And if the weight is coming on fast, or you also feel cold, worn out or your hair is thinning, see your doctor. It's worth checking your thyroid, and it's worth asking whether hormone therapy is right for you.`}</P>
    </BlogArticle>
  );
}
