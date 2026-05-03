# Maquinalista Call Prep — April 30, 2026 (11 AM)

## Who's in the room

| Person | Role | What they care about |
|--------|------|---------------------|
| **Artur** | Head of Marketing | Runs ALL ads and budget. Your primary counterpart. |
| **Renato** | Operations Manager | Oversight of the whole team. Efficiency, lead quality. |
| **Victor** | Developer | Building their products. Will ask technical questions. |
| **Martin (Marro)** | Your friend | Set up the meeting. Internal advocate. |

**How Martin framed it:** "A friend who makes ads more efficient is going to explain how he could help."

---

## Call Structure (30 min)

| Time | What | Who |
|------|------|-----|
| 0-3 min | Intro, thank Martin, elevator pitch of the problem | Everyone |
| 3-15 min | Discovery — let Artur explain their ads setup | Artur (mainly) |
| 15-18 min | Show demo, tied to what Artur just described | Everyone |
| 18-25 min | Discussion — reactions, questions | Renato & Victor jump in |
| 25-30 min | Next step — offer the free audit | Artur + Renato |

---

## Elevator Pitch (the problem — say this first)

> "Most companies running Google Ads can tell you which keywords get clicks. But they can't tell you which keywords actually generate revenue. Google Ads lives in one system, your CRM lives in another, and nothing connects them at the keyword level. So you end up with keywords that look great on clicks but produce zero deals — and keywords that actually close business but you don't know to scale them. We found that typically 20-30% of ad spend goes to keywords with zero pipeline. Juno connects the two systems and shows you the true cost per customer for every keyword — so you know which ones to scale and which ones to cut."

---

## Technical Explanation (only when they ask "how does it work")

> "The tracking between Google Ads and the CRM breaks for two reasons. First, Google's auto-tagging system — called GCLID — conflicts with UTM parameters, so the CRM misattributes where the click came from. Second, in long sales cycles, the GCLID expires before the deal closes, so the CRM says the customer came from 'direct traffic' when they actually came from a paid keyword. Juno fixes the tracking chain and then joins the keyword data to the deal data through the CRM's API."

---

## The Solution (what Juno does, four steps)

1. **Pulls keyword spend data from Google Ads via API** — every keyword, spend, clicks, and the actual search terms people typed
2. **Fixes the tracking chain (UTMs)** — checks that UTM parameters are on every ad URL, that utm_term carries the keyword, and that GCLID isn't conflicting
3. **Pulls contact and deal data from the CRM via API** — which contacts came in, what keyword sent them, which ones became deals
4. **Joins keyword to deal** — keyword → UTM term → contact → deal. Now you see true CAC per keyword.

**Output:** A table showing keyword, monthly spend, deals closed, true CAC, and a recommended action (scale, monitor, cut). Plus weekly email recommendations.

**One-liner:** "Google Ads is lead-driven. Juno is deal-driven. We start from the closed transaction and trace it back to the keyword."

---

## The Demo (tryjunoapp.com/demo)

- Show at the 15-min mark, after discovery
- Keep it to 3 minutes max
- Transition line: "Let me show you what this looks like in practice — takes 2 minutes."
- Show the table (keyword / spend / deals / CAC / action), point at color coding
- "Green means scale, red means cut. That's it."
- Stop sharing and read the room

---

## Discovery Questions (first 12 minutes — diagnose whether the problem exists)

### Phase 1: Understand their setup (3-5 min)

Start open. Let Artur talk. You're mapping how their ads work before you probe for the gap.

- "Artur, walk me through how you run ads today. What platforms, what's the setup?"
- "What keywords are you bidding on? Broad match, phrase match, exact?"
- "When someone clicks an ad, where do they land? A specific listing page or a general page?"
- "What CRM or system do you use to track leads and transactions?"

### Phase 2: Probe how they measure success (3-5 min)

Now you're looking for the gap. Listen for answers that stop at clicks, CTR, or cost per lead. If they can't answer the keyword-to-deal question, the problem exists.

- "How do you know if the ads are working? What metrics do you look at?"
- "When you say a keyword is 'performing well,' what does that mean — clicks? Leads? Actual transactions?"
- "Do you track ROAS? If so, is that at the campaign level or can you see it per keyword?"
- "If I asked you right now: which keyword generated your last closed transaction — could you tell me?"

**If they hesitate or say no to that last one, that's the moment.** That's the gap. You can say: "That's exactly the problem we solve."

### Phase 3: Dig into the pain (2-3 min)

Only ask these if Phase 2 confirmed the gap. Now you're quantifying the cost.

- "Do you deal with irrelevant search terms? Like people searching for machinery jobs or parts when you want actual buyers?"
- "How long does it take from first click to a completed transaction on your platform? Days? Weeks? Months?"
- "Do you use UTM parameters on your ad URLs, or rely on Google's auto-tagging?"
- "What's your biggest frustration with Google Ads right now?"
- "If you could see exactly which keywords generate transactions and which ones burn budget, what would you do differently?"

### What to listen for (signals the problem is real for them)

| They say... | It means... |
|-------------|-------------|
| "We look at clicks and CTR" | They're optimizing for traffic, not revenue. Gap confirmed. |
| "We track cost per lead" | Better, but still lead-driven, not deal-driven. Gap confirmed. |
| "We can see it at the campaign level" | Campaign-level, not keyword-level. Gap confirmed. |
| "We use Google's auto-tagging" | GCLID only — expires in 90 days, will break with long cycles. |
| "We don't use UTMs" | The keyword isn't reaching the CRM at all. Biggest gap. |
| "Honestly, we don't really know" | Bingo. |
| "We built something internal" | They've tried to solve it. Ask what breaks. |
| "We can trace keywords to transactions" | They might have it solved. Ask how, and look for cracks. |

---

## CRM Question (how to handle)

**Ask what they use first.** Then adapt:

- **If HubSpot:** "Perfect, we have a native integration ready."
- **If something else:** "Our attribution engine is CRM-agnostic — the core logic works the same. We launched the HubSpot connector first and we're selecting the next integration partners. If there's a fit here, building yours would be a priority."

**Never say** "we can connect to any CRM but only have HubSpot." It sounds like a promise you can't back up.

---

## Speak to Each Person

**Artur (marketing):** "This isn't about auditing you. It's about giving you the data to justify more budget, because you can prove exactly which keywords turn into revenue."

**Renato (ops):** "How much time does your team spend on leads that go nowhere? Juno cuts the keywords feeding junk into the funnel before it wastes anyone's time."

**Victor (dev):** "Once the API connections are set up, it runs on its own. Read-only access, no ongoing maintenance, no code to write."

---

## Closing / Next Step

> "I'd love to pull your Google Ads data and show you exactly which keywords are generating transactions and which ones aren't. A free audit — takes about 30 minutes, no strings."

---

## Key Terms Cheat Sheet

| Term | What it means | When it comes up |
|------|--------------|-----------------|
| CPC | Cost per click — what you pay per ad click | Artur will reference this |
| CTR | Click-through rate — % who see ad and click | Measures ad quality, not revenue |
| ROAS | Return on ad spend — revenue / spend | Ask: "at campaign level or keyword level?" |
| Match types | Broad / phrase / exact — how loosely Google interprets your keyword | Broad match = where the waste lives |
| Search terms vs Keywords | Keyword = what you bid on. Search term = what user actually typed | Google hides 80% of search terms since 2020 |
| Negative keywords | Words you exclude so your ad doesn't show | Most companies have incomplete lists |
| UTM parameters | Tags on URLs that tell the CRM where the click came from | utm_term is the critical one — carries the keyword |
| GCLID | Google's auto-tag on every click. Expires in 90 days, conflicts with UTMs | Why attribution breaks in long sales cycles |
| CAC | Customer acquisition cost — spend / customers acquired | Google shows cost per lead. Juno shows cost per customer. |
| First-touch attribution | Credit goes to the first keyword that brought them in | What Juno v1 does |
| Pipeline | Deals in progress in the CRM | "Zero pipeline" = keyword produces leads but no deals |

---

## What Maquinalista Does

Brazilian marketplace for buying/selling used agricultural and construction machinery (excavators, tractors, harvesters, trucks). Two-sided marketplace. Recently launched "Maquinalista Agro" for agricultural equipment.

**Why the attribution gap hits them:**
- High-ticket items = expensive wasted clicks
- Two-sided (buyers AND sellers) = keyword overlap problem
- Long consideration cycle = GCLID expires before transaction
- "Trator usado" pulls in price browsers, parts seekers, job seekers — not just buyers

Here's the chain:                                                                                                                                                     
                                                                                                                                                                        
  Day 1: Someone searches "used excavator," clicks your ad. The ad URL has UTM parameters:                                                                 maquinalista.com/excavators?utm_source=google&utm_medium=cpc&utm_term=used+excavator                                                                                  
                                                                                                                                                                        
  They land on the site and fill out a contact form (or create an account, or whatever the conversion action is). At that moment, the CRM creates a contact record and  
  stores the UTM data from that first visit — including utm_term=used+excavator.                                                                                        
                                                                                                                                                                        
  That's the moment that matters. The keyword is now written to the contact record in the CRM. It's not a cookie. It's not a tracking pixel. It's a field on the        
  contact, stored permanently.
                                                                                                                                                                        
  Day 91: The person comes back organically, browses around, eventually buys an excavator. The deal closes. The CRM records the deal and links it to the contact.       
   
  Juno's job: Pull the contact from the CRM. Read the utm_term field (which still says "used excavator" from day 1). See that this contact has a closed deal. Match it  
  back to the keyword "used excavator" in Google Ads. Calculate: spend on that keyword / deals attributed to it = true CAC.
                                                                                                                                                                        
  Juno doesn't need to know it's "you." It just needs:                                                                                                                  
  1. The keyword to be written to the contact record on first touch (that's the UTM fix)
  2. The contact to be linked to a deal in the CRM (that's standard CRM workflow)                                                                                       
  3. Read access to both systems (that's the API connections)                    
                                                                                                                                                                        
  The whole point of step 2 in Juno's process — fixing the UTM setup — is to make sure that utm_term actually gets captured and stored correctly on day 1. If the UTMs
  are broken or GCLID is overwriting them, the keyword never makes it to the contact record in the first place, and then there's nothing to attribute on day 91.        
                                                            
  So to be precise: Juno doesn't track users. It makes sure the CRM captures the right data on first touch, then reads that data when the deal closes.                  


                      RD Station
 CRM RD Station                                      