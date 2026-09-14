import BlogArticle from "@/components/blog/BlogArticle";
import { H2, Item, List, P } from "@/components/blog/Prose";
import { getPost, postMetadata } from "@/lib/blog";
import {
  CARDIO_VOLUME,
  MOVEMENT_VOLUME,
  POWER_RAMP_WEEKS,
  intervalsMinutes,
} from "@/lib/plan/catalog";
import { PLAN_ARC } from "@/lib/planPillars";
import { PLAN_WEEKS } from "@/lib/pricing";

const post = getPost("8-week-plan-menopause-weight-gain");
export const metadata = postMetadata(post);

/*
 * Every number on this page is read off the plan generator's own tables, so
 * the article describes the plan she would actually get. If a figure here
 * looks wrong, the table changed - fix the copy around it, not the import.
 *
 * Level names are descriptions, not the quiz's option labels.
 */
const S = MOVEMENT_VOLUME;
const C = CARDIO_VOLUME;
const [BASICS, BUILD, LOCK] = PLAN_ARC;
// Intervals arrive with the second phase: CARDIO_VOLUME's bands are the arc's.
const INTERVALS_FROM = BUILD.from;
const MEDIUM_BUILD_WALK = C.medium.minutes[1];

export default function Page() {
  return (
    <BlogArticle
      post={post}
      answer={`A realistic week has four parts: short strength sessions ${S.beginner.sessions} to ${S.advanced.sessions} times a week, a walk on most days, protein at every meal, and a few minutes of winding down. It starts gently, with nothing jumping or all-out in the first two weeks, and builds in three stages: ${BASICS.label.toLowerCase()}, ${BUILD.label.toLowerCase()}, ${LOCK.label.toLowerCase()}.`}
    >
      <P>{`Most weight plans fail in week two. Not because they're wrong, but because they don't fit a real life. Too long, too hard, too many rules. When I thought about what a plan for menopause weight gain should look like, I kept coming back to one question: could a tired, busy woman actually do this on a Tuesday?`}</P>
      <P>{`So here's what a realistic week looks like, how it changes over ${PLAN_WEEKS} weeks, and why each piece is there.`}</P>

      <H2>{`The four parts of every week`}</H2>
      <List>
        <Item title="Strength work,">{`short sessions that rebuild muscle.`}</Item>
        <Item title="A daily walk,">{`easy on your joints and good for belly fat.`}</Item>
        <Item title="Food,">{`protein at every meal and a short list of simple habits.`}</Item>
        <Item title="Winding down,">{`a few minutes a day for sleep and stress.`}</Item>
      </List>

      <H2>{`Strength work: the part I'd never skip`}</H2>
      <P>{`Menopause takes muscle, and muscle is what keeps your body burning energy at rest. Strength work is the only thing that builds it back, so it sits at the center of the week. How much depends on where you're starting:`}</P>
      <List>
        <Item title="Just starting out:">{`${S.beginner.sessions} sessions a week, about ${S.beginner.minutes} minutes each.`}</Item>
        <Item title="Fairly active:">{`${S.medium.sessions} sessions a week, about ${S.medium.minutes} minutes each.`}</Item>
        <Item title="Already training:">{`${S.advanced.sessions} sessions a week, about ${S.advanced.minutes} minutes each.`}</Item>
        <Item title="Short on time:">{`${S.movement_snacks.sessions} one-move bursts a day, about ${S.movement_snacks.minutes} minutes in total, with different moves every day.`}</Item>
      </List>
      <P>{`The moves are ones you can do at home: squats, lunges, bridges, planks, push-ups against a wall or on the floor. Two sessions a week also end with a short set of small hops and landings, because bones get stronger when they're loaded. For the first ${POWER_RAMP_WEEKS} weeks, nothing leaves the ground.`}</P>

      <H2>{`The daily walk`}</H2>
      <P>{`Every version of the plan has a walk on most days. It's the one thing you can do every day without needing to recover from it. It also starts small:`}</P>
      <List>
        <Item title="Just starting out:">{`${C.beginner.minutes[0]} minutes a day at first, building to ${C.beginner.minutes[2]}.`}</Item>
        <Item title="Fairly active:">{`${C.medium.minutes[0]} minutes a day, building to ${C.medium.minutes[2]}.`}</Item>
        <Item title="Already training:">{`${C.advanced.minutes[0]} minutes, ${C.advanced.sessions} days a week, building to ${C.advanced.minutes[2]}.`}</Item>
        <Item title="Short on time:">{`${C.movement_snacks.minutes[0]} minutes every day, the same all the way through.`}</Item>
      </List>
      <P>{`From week ${INTERVALS_FROM}, if you're fairly active or already training, two of those walks become a short interval session of about ${intervalsMinutes()} minutes: five easy minutes, then 30 seconds as hard as you can go with two minutes of complete rest after, three or four times, and five easy minutes to finish. Nobody does this in the first two weeks.`}</P>

      <H2>{`Food: not a diet, a daily checklist`}</H2>
      <P>{`There's no meal plan to follow and nothing to weigh. Instead there's a short list for each day, and you tick what you did. It includes:`}</P>
      <List>
        <Item>{`25 to 30 grams of protein at each meal`}</Item>
        <Item>{`fiber and some healthy fat with your meals`}</Item>
        <Item>{`20 squats after you eat, which helps your muscles soak up the sugar from the meal`}</Item>
        <Item>{`12 hours overnight without food, which you mostly sleep through`}</Item>
        <Item>{`about five hours between meals, without snacking in between`}</Item>
        <Item>{`six glasses of water`}</Item>
      </List>
      <P>{`You won't hit all of them every day. Nobody does. You tick what you did, and the ticks add up.`}</P>

      <H2>{`Winding down`}</H2>
      <P>{`A few minutes a day for your nervous system, like a short breathing exercise before bed, plus one small daily habit, such as getting up at the same time every morning. It sounds minor. But stress and bad sleep both make you hungrier and push fat toward your middle, so this is part of the weight plan, not a bonus.`}</P>

      <H2>{`How the ${PLAN_WEEKS} weeks build`}</H2>
      <List>
        <Item title={`${BASICS.weeks}: ${BASICS.label}.`}>{`Easy walks, short sessions, nothing all-out. The goal is to show up, not to wear yourself out.`}</Item>
        <Item title={`${BUILD.weeks}: ${BUILD.label}.`}>{`Walks get a little longer, and if you're fairly active or already training, the two interval days come in.`}</Item>
        <Item title={`${LOCK.weeks}: ${LOCK.label}.`}>{`Walks at their longest, and habits that by now mostly run on their own.`}</Item>
      </List>

      <H2>{`What a real Tuesday might look like`}</H2>
      <P>{`Here's an example for a fairly active woman in week ${INTERVALS_FROM}, on one of her strength days:`}</P>
      <List>
        <Item title="7:00">{`Up at the same time as yesterday.`}</Item>
        <Item title="7:30">{`Breakfast with 25 to 30 grams of protein, then 20 squats.`}</Item>
        <Item title="12:30">{`Lunch, protein again, then a ${MEDIUM_BUILD_WALK}-minute walk.`}</Item>
        <Item title="6:00">{`A ${S.medium.minutes}-minute strength session at home.`}</Item>
        <Item title="9:30">{`A few minutes of slow breathing before bed.`}</Item>
      </List>
      <P>{`That's about an hour of actual doing, spread across a day you were already living. On the days in between, it's the walk, the food and the wind-down.`}</P>

      <H2>{`What to expect`}</H2>
      <P>{`No honest plan can promise you a number on the scale, and I won't. What ${PLAN_WEEKS} weeks of this gives you is a stronger body and a routine that finally fits your life. Your waist and how your clothes fit are often the first things to change, before the scale does. That's the muscle doing its work.`}</P>
    </BlogArticle>
  );
}
