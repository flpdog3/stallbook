# Stallbook — setup

Eight files. Put them online once, install to the iPad home screen, and you're done.

The seven tabs down the left are **Sell, Make, Inventory, Equipment, Events, Reports, Safe**.

## 0. Try it on Windows first

Same file, no conversion. Put the folder anywhere and double-click **run-windows.bat**.
It starts a small local server and opens `http://localhost:8899/index.html`. Keep the
black window open while you use it; closing it stops the server.

It needs Python on PATH. If you don't have it, the batch file says so, and
`npx serve -l 8899` works instead if you have Node.

**Don't double-click index.html directly.** Browsers give `file://` pages no storage, so
the app will refuse to start. It has to come from the localhost address.

### Seeing it at iPad size

In Chrome or Edge press **F12**, then **Ctrl+Shift+M** for device toolbar, and pick iPad
from the dropdown. You get the right dimensions and touch targets. Rotate with the icon
next to the dropdown to check the portrait layout.

This is Chrome's engine, not Safari's, so it won't catch iOS-specific quirks — and the
share sheet and Add to Home Screen don't exist here. It's for layout and workflow. Real
iPad testing still has to happen on the iPad.

### Editing it

Open `index.html` in any text editor, save, refresh the browser. The offline cache is
switched off on localhost, so what you see is always your latest save. Nothing else is
needed — no build step, no compiler.

### Moving your work to the iPad

Best way to use this: set the catalogue up here, with a keyboard and your photo folder,
rather than thumb-typing on the iPad. Then **Safe → Save a backup**, email the `.json` to
yourself or drop it in iCloud Drive, and on the iPad use **Load a backup**.
Items, photos, option layers and prices all come across.

The two copies are independent after that — Windows and iPad each keep their own data.
Treat the iPad as the real one once you start selling, or you'll overwrite real sales
with test data.

## 1. Put the files on GitHub Pages

1. Sign in at **github.com** → **New repository**.
2. Name it `stallbook`. Choose **Public**. Create it.
   *Public is fine — only the app code goes here. Your sales data never leaves the iPad.*
3. On the new repo page click **uploading an existing file**, then drag in all five:
   `index.html`, `app.js`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`.
   Click **Commit changes**.
4. **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**,
   branch **main**, folder **/ (root)**. Save.
5. Wait about a minute, then open `https://YOUR-USERNAME.github.io/stallbook/`

## 2. Install it on the iPad

1. Open that URL in **Safari** (not Chrome — only Safari can install to the home screen).
2. Share button → **Add to Home Screen** → Add.
3. Open it from the home screen icon **once while you still have signal**. That fills the
   offline cache. After that it runs with no connection at all.

**Use the home screen icon from then on.** The home screen app and the Safari tab keep
separate storage, so data entered in one won't appear in the other.

## 3. First run

- Tap the **Selling at** pill at the top right to **open a selling day**, and again at
  pack-down for **Done selling for today** — date, location, event type.
  Every sale gets stamped with these, which is what makes the reports work.
- **Make** tab → add the things you make. Photo, price, cost to make, and any option layers.
  A layer is a choice the buyer makes: Colour, Size, Character. Each option can add or
  subtract from the price (Glitter +2.00, Jumbo +3.00).
- **Sell** tab → tap a balloon. Items with layers open a chooser; items without go straight
  into the ticket. Tap a line on the ticket to change its price, quantity or colour.
- Tap any line on the ticket to change quantity, price or colour; the **✕** takes it straight off.
- After **Complete order** you get a few seconds to **Undo**. **Start over** asks first.

### Selling and Prices

The Sell tab has two views, switched at the top left: **POS** and **Vendor view**.

**POS** is what you use with a customer there: only what's on sale today, grouped by
what it is, showing nothing but the price. Today's running total is hidden.

### Has the day paid for itself?

Low down the left-hand menu, one square says how the day is going, and what it says
depends on which view you're in. In **Vendor view** it's the running total, **Today
$84.00**. In **POS**, with a customer leaning over the table, the figure goes and the same
square answers in colour alone: **red** means less than halfway; **amber**, more than half
but not there yet; once the day has covered its stall fee and travel it turns the same green
as the menu and effectively disappears.

It counts what you've kept — takings less sales tax, card fees and what the balloons cost —
against the stall fee and travel for that visit, split across its days if it runs more than
one. A market that costs nothing to stand at has nothing to recoup, so the square sits green
from the start. Tap it for the figures in **Selling at**, or switch to Vendor view for the
running total.

**Vendor view** is yours. Every product and every material you sell straight, on or off, with
what you charge, what you keep and the margin under each. Tap a card to set its price and whether it's on sale today, and to work through its
**Options** — every material it could use, each with an **On/Off** for today and the extra a
customer pays for picking it ("Glitter +2.00"). Switching an option off leaves it in stock
and keeps its history; it simply isn't offered at the counter. That's how you handle not
bringing orange to a particular event. Something switched off keeps its price and stock; it just isn't offered.

Products are grouped by a **Group** you set on the Make screen — Balloon art, Headbands —
managed like Inventory types. Materials you sell as they come appear under their own type.

### More than one ticket

Two people serving means two sales on the go. With one ticket it sits on the far right as
usual. Add a second and the other tickets move into a narrow column on the far right, with
the one you're working on — **outlined in green** — to its left.

Each waiting ticket shows its name, total and the first three things on it ("1× Balloon dog
· Blue"), with "+2 more" if there are others, so you can tell two tickets apart at a glance.
That column scrolls, so a busy stall doesn't squash them down to nothing.

Tap a waiting ticket to make it the open one, **+ Another** to start a fresh one, and the
**✕** on the open one to close it (it asks first if anything's on it). There is always at
least one. Tickets survive a reload.

Every line lists what was made and the material chosen — "Balloon dog · Red".

### Changing one of several

Tap a line with more than one on it and you're asked whether you're changing **just 1** or
**all of them**. Change a subset and it splits onto its own line, so a ticket can carry two
balloon dogs at full price and one at a discount.

### One that popped

Tap the line and hit **Popped**. It lists the materials that attempt used up, asks what
happened — Popped, Went wrong, Wrong colour, Dropped it, or your own words — and writes them
off the shelf there and then. The ticket is left exactly as it was, ready for another go.
The write-off reads "Popped while making Balloon dog" so the Reports tell you which
products cost you the most in retries.

### Price at the counter

Each thing has a usual price, but the price row on any line offers three:
**Full price**, **A deal** (10% / 20% / 50%, or type your own), and **A gift** — with a
reason: Popped one / Little sister / Saying sorry / A prize, or your own words.

Whichever you use, the usual price is kept alongside, so Money can show what you gave
away. The footer reads "That's $5.40 / instead of $6.00" as you go.

### Replacements

Under **Other ways to charge** there's **Swap a broken one**, for handing over a new one
when the first went wrong. Enter a replacement fee or leave it at zero for no charge, and say why: Defective,
Popped or broke, Wrong item given, Wrong option given, Damaged by customer, Goodwill — or
your own words.

A swap is deliberately not the same as **A gift**. A balloon handed to a child to
draw a crowd is marketing; a balloon replacing one that popped is a quality cost, and
mixing them hides a problem worth seeing. So Reports counts them apart:

- **Given away** stays for genuine giveaways.
- **Replaced · net cost** shows how many went out and what it cost you after any fees.
- **Replacement rate** is replacements as a share of units actually sold.
- Best sellers gains a **Replaced** column, so if one variant is the one that keeps coming
  back, it shows up against that variant rather than in a general total.

The original sale stands — you keep that money, and the replacement draws its own unit
from stock at its own FIFO cost. Don't also write off the returned one: it was already
sold and costed, and writing it off would count the same loss twice.

### Something not on the list

The **+ Something else** button sits above the grid, next to POS / Vendor view. It asks a
price, what to call it, how many, and a note — "Balloon arch, $45, party job".

Under **What it used**, pick the supplies it ate straight from inventory and say how many of
each. Picking goes in two steps, the way inventory itself is laid out: choose the **type**
first — Balloons, Ribbon — then the exact one by name, with how many are left shown beside
it. The type stays put after each pick, so two colours out of the same box go in one after
the other. Anything already on the list drops out of the choices.

Those come off the shelf when the sale goes through, exactly as a recipe would, so the cost
is worked out from the batches you actually paid for and the counts stay right. It shows
what the pick adds up to at what you last paid. Leave it empty and it's just a price with
nothing behind it.

One-offs show up in Reports under whatever you called them. If the same name keeps
appearing, that's a hint it deserves a proper tile under **Make**.

### How they paid

The ticket ends in **Cash**, **Venmo** and **Other**, in place of one Complete order button.
Card lives behind **Other** until you want it on the ticket — under **Paying & tax**, *On the ticket* picks
which way of paying sits beside Cash. Which one you tap is stored on the sale, so Reports can show takings split by method and
the cash tray can be checked at the end of the day. A ticket that comes to nothing — all
gifts or practice — shows **Complete order** instead and asks nothing.

**Other** lists every other way you've set up — Card, and anything else — and lets you add one
on the spot: type "Zelle", tap **Add it and use it**, and the sale goes through against it.

Sales from before all this existed read as **Not recorded**, and are left out of the cash
tray sums rather than being assumed to be one thing or the other.

### Change

Tapping **Cash** shows what's due and the likely notes — exact money, then the next round
figures up — plus a box for anything else they hand you. The change appears in large type
with the notes and coins to count out: "$3.85 · 3 × $1 · 3 × quarters · 1 × dime". **Sold**
records the sale with what they gave and what went back; **Skip the change** records it
without. If they haven't handed over enough yet, it says how much is still to come.

Switch the whole thing off under **Paying & tax** if it slows you down.

### Paying & tax

In **Vendor view** at the top of the Sell screen, next to the price switches. Three things
live there:

- **What it costs you to take the money.** A percent, a few cents a sale, or both, for the
  card reader and each other way to pay. Fees never change what the customer pays — they
  come off what you kept, and get their own line in the cash flow.
- **Change** — the calculator above, on or off.
- **Sales tax** — off until you switch it on.

With tax on, pick a rate and whether **prices include it** or it's **added at the till**.
Prices including it is the easier way at a stall: a $6 dog stays $6, and the tax inside it
is worked out for the reports. Added at the till shows the price, then the tax, then the
total on the ticket.

Two exceptions are handled. A market in another town or county can carry its own rate —
set **Sales tax rate here** on the event, and leave it empty everywhere else. And anything
you don't charge tax on gets **Charge sales tax on it** switched off on its price sheet.

Tax is never counted as yours: **Money taken** is what customers handed over, and **Money
kept** has the tax and the card fees taken out before anything else.

## Stock: materials and products

There are two lists, under **Items**: **Products** (what you sell) and **Materials**
(what you buy). Which one holds the stock depends on how a product is made.

### Materials

A material is a thing you buy and count: a white 260, a metre of curling ribbon, a foil
weight. Each has a **category** — that's how recipes find it. Everything you'd happily
swap one for another shares a category, so White, Red and Glitter are all "260 balloon".

- **Usual cost per unit** is a fallback, used when you've run out and haven't recorded a
  batch. The real cost comes from the batches.
- **Adds to the price** is what the buyer pays extra for picking that one — a glitter
  balloon at +2.00. Leave it blank when it makes no difference.
- Stock goes in as dated **batches** with what each unit cost, exactly as before, and it
  comes out FIFO.

### Setting a price

Price isn't part of making something — it's set from the **Sell** screen. Tap the price on
any tile and the sheet tells you what it costs to make and what you'd keep at the price
you type.

### What it costs to make

For something built from materials you don't type a cost — the item editor works it out from
the recipe at today's prices, itemised line by line ("1 × Colour (average of 7) $0.15",
"0.5 × Curling ribbon $0.03", "Each one costs $0.18"). A choice line averages its type,
since which colour gets used varies.

That figure is only an estimate for the Make list and a fallback for when a material runs
short mid-sale. The cost recorded against an actual sale is always the real FIFO cost of
the balloons that went into it.

**I pre-make these and count them** is a toggle. Leave it off and the product is built to
order from materials. Switch it on and you get batches to count, each with what that batch
cost to make.

### Products, and how they're made

Each product picks one of four:

- **Not counted** — nothing tracked.
- **One running total** / **separately per option combination** — finished goods you
  counted in by hand. Right for anything you pre-make and stock.
- **It's made from materials** — give it a **recipe**, and a sale consumes the materials
  rather than a finished unit.

A recipe line is either **a choice from a category** ("1 of any 260 balloon"), decided at
the counter, or **this exact material** ("0.5 m of curling ribbon", every time). Add a new
colour to your materials and every recipe that says "any 260 balloon" can use it
immediately — no recipe editing.

**Quantity can change with one option layer.** Set "Quantity changes with: Size" on the
balloon line and give Jumbo a 2, and a Jumbo takes two balloons while the ribbon line
stays at 0.5. Each line varies by at most one layer, which keeps it unambiguous.

### What's in the kit

Everything is "in the kit" until you say otherwise. **In the kit** lists every material as a tappable pill — tap the colours you didn't load into the car and
they drop off the counter for the day. They keep their stock and their history; they just
stop cluttering the picker. **Bring everything** and **Only what's in stock** set them all
in one go, which is the usual move the night before a market.

A material left at home shows a "Left at home" chip on Inventory, and doesn't count towards
what a product can make.

### At the counter

Tapping a product with a choice in its recipe opens the sheet and asks which one. It shows
only what you brought **and** have in stock, with counts — so a colour that's run out or
stayed at home isn't there to mis-tap. **Show N I didn't bring** reveals the rest when the
count is wrong or you fetched something from the car. Picking Glitter adds its price uplift — multiplied by how
many it uses, so a Jumbo glitter dog is base + Jumbo + two lots of the glitter uplift.

Completing the sale takes the materials out, oldest batch first, and the cost recorded
against that sale is what those particular balloons cost. Sell tiles show **how many you
could make**, limited by whichever material runs out first — not a finished-goods count.

Running out never blocks a sale. It goes through, the shortfall is flagged, and those
units are costed at the material's usual cost.

### The rest

- **Undo** returns materials to the exact batches they came from, or writes them off as a
  loss — same question, same reason lists, whether the line drew finished goods or
  materials.
- **Warn me at or below** works on materials too, and the Materials view flags what's low.
- **Safe → Spreadsheets → Inventory** lists batches for both products and materials, the write-off log,
  the reversal log, and what each sale consumed.
- Margins in the product list are marked with a `*` when estimated from what materials
  usually cost. The figure on an actual sale is always the real one.

## Equipment

**Equipment** is what the stall is built from — the table, the tablecloths, display stands,
signs, the gazebo, the card reader. It's bought once, used every market and never sold, so
it lives on its own tab rather than in Inventory. Nothing here has batches, FIFO cost or
write-offs, and none of it touches the cost of anything you make or the profit figures in
Reports.

Each entry has a name, a type, a photo, how many you have, what each cost, when and where
you bought it, a condition (**Good**, **Showing wear**, **Needs fixing**) and a note — handy
for "leg wobbles, pack the shim". The top of the tab totals how many pieces are in use,
what they cost you, and anything that needs fixing before the next market.

Types (Coverings, Displays, Furniture, Shelter, Signage, Tech and payments to start) only
group the screen; **Types** adds or removes them, and **+ New type…** in the dropdown adds
one on the spot. Something you've stopped using can be marked **Retired** — it folds into a
collapsed section at the bottom with its record intact. Delete goes through Recently
deleted like everything else.

Equipment is included in backups, and **Safe → Spreadsheets → Equipment** exports the list.

## Events and selling days

An **event** is the fair or market itself. It holds the things that don't change from one
visit to the next: website, organiser's name and number, address, booth fee, pitch size,
load-in time. A **selling day** is one date you actually trade, and it hangs off the event.
A three-day fair is one event with three days; a monthly market is one event you add a new
date to each time. Sales attach to the day, so the reports can tell the days apart.

**Copy** on an event duplicates everything except the dates, application status and rating —
the quickest way to set up next year's run of the same fair.

### Registration and deadlines

Each event tracks when registration opens, when applications close, and where you stand
(not applied / applied / waitlisted / accepted / booked & paid). The **Coming up** list at
the top of the Days tab sorts everything by how near it is, and an amber dot appears on
the tab when something needs attention — a closing deadline, an accepted event whose fee
you haven't paid, or a deadline that passed while you never applied.

The app cannot send you a notification; iOS gives web apps no way to do that. What it can
do is hand the dates to your real calendar. **Put them in my calendar** produces a
file with every upcoming registration date and selling day, each with an alert the day
before (deadlines also get one a week out). Open it, add it to Calendar, and the alerts
follow you onto your phone and watch.

### What it cost to be there

Each event carries a booth fee and a travel figure. Reports → Takings now separates three numbers:
what you **took**, the **cost of goods**, and **fees and travel** — with **net profit**
being what's actually left. The "Was it worth going?" table ranks events by net, which is
the honest answer to whether to apply again. A fee counts once per event, not once per day.

## Reports

**Reports** holds seven views, switched at the top, all filtered by date except the last:

- **Takings** — money taken, what the balloons cost, stalls and travel, what's left, plus
  how people paid, every market day, most popular, and was-it-worth-going.
- **Markets** — every event side by side, best first, so you can see which are worth
  reapplying to.
- **By hour** — when in the day the money actually comes in.
- **Written off** — the cost of stock that never sold, grouped by reason, by material and by
  month, with every individual write-off listed.
- **Material use** — what you've bought over time, how much of it became sales, how much was
  written off, and what's still sitting on the shelf.
- **Cash tray** — whether the cash added up at the end of each market day.
- **Cash flow** — money into and out of the business, and what's left in it.
- **The year** — one page covering a whole calendar year, ready to print or hand over.

### Markets

One row per event, sorted by what was left after everything: takings, less sales tax and
card fees, less what the balloons cost, less the stall fee and travel. The bar shows the
size of it; green is a profit, amber a loss.

Fill in **Opens** and **Closes** on an application and that market also gets a figure per
hour, which is what settles arguments about the long ones. A quiet eight-hour barn sale and
a busy four-hour fair can take the same money and be nothing alike.

Tap a market to see every visit on its own, each with its full breakdown and whatever you
wrote in **How it went**. The market search and event-type boxes narrow this view too.

### By hour

Every sale by the hour it was rung up, with the busiest hour, the hours you actually sold
across, and when half the day's money was in. Where more than one market day is in range,
**Average market day** divides it out so you see a typical day rather than a total.

It answers practical questions: when to take a break, when to restock, whether the last
hour earns its keep, and whether arriving earlier would be worth it.

### Equipment: repairs and changes

An equipment card has a **Repairs and changes** list: what was done, what it cost, when, and
a receipt photo. A new gazebo leg, a re-cover, a paint job. It counts as a running cost
rather than buying kit again, so it lands in the cash flow as an expense and gets its own
line on the year page.

### The year

Set the dates at the top — it opens on the year so far — and it lays out the whole thing: what you took, the sales tax inside it, how
people paid, what the balloons cost, card fees, stall fees, travel, every other expense
listed one by one, the cash tray over or short, and what was kept from trading. Below that:
stock and equipment bought, money put in and paid to the two of you, what was in the
business at the year end, and the markets ranked by takings.

Any range works: a calendar year for the accounts, last quarter for a sanity check, all time
for the whole picture. **Year to date** and **Last year** are in the range dropdown.

Two things worth understanding before anyone reads it as accounts. **Stock bought** is money
that went out that year; **what the balloons cost** is what actually went out inside things
sold, and the two differ by whatever is still on the shelf. **Equipment** sits on its own
because a gazebo is kit, not a running cost.

**Save it as a page** writes an HTML file — open it and print or save as PDF from the
share sheet — with every receipt photo from those dates at the bottom. **Spreadsheet**
writes the same lines as a CSV. It's a summary of your own records, not tax advice.

### The cash tray

Opening a selling day asks what's in the tray to start with. That float is change you
already had, not money going into the business, so it stays out of the cash flow.

While you're selling, **Out of the tray** on the Selling at pill records anything paid for
out of the cash box — ice, a bag of cups, lunch money for whoever's on the stall. It comes
off what the tray should hold and lands in the cash flow as an expense or as money paid to
one of you.

At close-up, the app works out what should be there:

    float + cash sales − anything paid out of the tray

Type what you counted, or tap **Count it note by note** and enter how many of each note and
coin — the total fills itself in. It then says **Spot on**, **$2.00 over** or **$3.50
short**. If you took card payments, there's a box for what the reader says it took, checked
against the card sales here.

The **Cash tray** report lists every market day with its float, what it should have held and
what it did, the total over or short across the dates chosen, and which days were never
counted. Tap any day to count it again or fix the float afterwards. A few cents either way
is normal; the same shortfall turning up again and again usually means change given wrong,
or something paid for out of the tray without being written down.

### Cash flow

Most of the cash flow fills itself in from the rest of the app: takings from every selling
day, materials by the date each batch came in, equipment by the date you bought it, stall
fees by the date you marked them paid, and travel once you've gone. Pre-made batches aren't
counted, because the materials that went into them already were.

What the app can't see is the two of you, so three buttons sit at the top:

- **Set starting cash** / **Put money in** — the cash the business began with, and anything
  you put in from your own pocket since. Starting cash only needs entering once.
- **Pay ourselves** — profit you take out. It shows what's in the business right now before
  you record it, and asks first if you're taking out more than it knows is there.
- **Other expense** — anything paid for that isn't stock, equipment or a stall fee:
  insurance, a permit, card-reader fees.

Card and app fees come off on their own line, and any day the tray was over or short shows
as **Tray over and short**, so the balance matches what the business actually has.

Each entry says who it was from or paid to, so **Each of you** shows what each person put in
and took out over the dates chosen. **In the business now** is the running balance up to
today; **From trading** is takings less everything spent, before anything paid to you.
**Every movement** lists each one with the balance after it — tap anything you entered to
change or delete it. Takings are what customers handed over, sales tax and all, so the
balance is what the business has in total, not what's in the cash box.

**Safe → Spreadsheets → Cash flow** exports the full list with a running balance.

## Getting ready for a market

Getting ready happens under **Events**: **Get packed** on a booked card, or **Pack** on a day
coming up in the **Selling at** picker. The way home looks after itself — tick **Done selling
for today**, then **Close it up**, and if anything was packed the load-out list comes up on
its own. Each half opens alone, so there's nothing to switch between mid-market.

### What to bring

The app looks at what this market bought last time — the last four selling days there —
works out a typical day for each thing you sell, and adds a margin. With no history at this
market it falls back to other markets of the same type, and failing that to everything
you've ever sold. The sheet says which it used.

Each line reads "usually 15 a day · most ever 20 · can make 30", so the suggestion is never
a number out of nowhere. The margin switch at the top offers **What sold**, **Half as much
again** (the default) and **Double it** — running out at noon costs more than carrying a few
spares home.

Type over any number and it's remembered for that selling day. Anything you plan to bring
more of than you have shows in amber: **make or buy 8 more** for things counted by the
piece, **short of materials for 8** for things built from balloons. That's your to-do list
for the night before. Things that have never sold at this sort of market sit at zero; **Show
everything you sell** lists them anyway.

### Pack it

Your equipment appears automatically — everything under **Equipment** that isn't retired —
along with a starting list of the easily forgotten: float, card reader, bags, tape, bin bag,
water. Whatever you're bringing to sell appears at the top as its own group, "Dog ×24".

Tick things as they go in the car. Add anything else at the bottom, with **Only for this
market** if it's a one-off; leave it off and it joins the master list for every market. The
✕ takes something off for this market alone, so the gazebo can sit out an indoor event
without vanishing everywhere else.

### Coming home

This half lists everything that went out and nothing else, to be ticked again as it
goes back in the car. Whatever stays unticked is still on the table — it says so plainly,
by name. Something you took off the list mid-market still shows here, because it left the
house either way.

Ticks live on the selling day, so every market starts with a clean list. You don't go
looking for this half: closing up brings it up by itself, right when you're about to load
the car. If everything is already ticked back in, it doesn't bother you.

## Receipts

Anywhere money goes out, there's a **Receipt** row with **Add a photo**: recording an
expense or paying yourselves in the cash flow, a stall fee on an application, stock booking
in or any batch you add by hand, and equipment — both what you paid for it and anything
spent on it since. On the iPad that opens the camera, so a receipt can be
photographed at the stall and filed against the entry then and there.

Photos are shrunk to about 1400 pixels — enough for the small print to stay readable — and
kept in their own store rather than inside the entries. That matters for backups: an
ordinary backup stays small enough to email, and under **Safe → Receipts** there's **Save
the receipts**, which writes every one into a single page with its date, what it was and how
much, ready to print or file. The year summary carries that year's receipts at the bottom
of its page.

If you'd rather not think about it, switch **Put them in backups too** on under Safe. Every
backup then carries the photos — safer, but a much bigger file to send anywhere.

A receipt belongs to its entry. Delete the entry and the photo goes with it; put the entry
back from **Recently deleted** and the photo comes back too. Photos left over from entries
that no longer exist are cleared out when the app starts.

## Photos

A photo fills the whole width of its card — on the Sell tiles, and on the Make, Inventory
and Equipment cards — because at arm's length a thumbnail tells you nothing.

When you pick a photo, **Frame the photo** opens straight away. Drag the picture to move it,
pinch or use the slider to zoom, and the square you see is the square the card shows.
**Show the whole photo** zooms out so nothing is cut off, for a wide picture that only makes
sense entire. **Fill the square** puts it back to the middle.

To change it later, tap the picture in the editor, or the **Frame it** button beside it. The
full picture is kept behind the square, so re-framing never loses anything — you're always
working from the original, not from an already-cropped copy.

## Offline

A small pill next to **Selling at** speaks up only when it matters. **Offline** means
there's no signal — which changes nothing, since selling, stock and reports all run on the
tablet itself. **New version ready** appears after you've pushed an update to GitHub Pages;
tap it to load the new one, and everything saved stays as it is. Tap the pill any time for
what does and doesn't need a signal.

## Fonts

The app uses Quicksand and Nunito Sans from Google Fonts. **Open it once with a signal**
after installing — the service worker caches them, and after that it looks right offline.
Without them it still works, falling back to the iPad's own rounded face.

If you'd rather not depend on that, download the two font families as `.woff2`, drop them
in the folder, swap the `<link>` in `index.html` for an `@font-face` block, and add the
filenames to `ASSETS` in `sw.js`.

## Inventory

A material can be sold as it comes: open it and turn on **Sell it as it comes**. Its price
is set in **Sell → Vendor view** along with everything else you charge for, not here. It then appears on the Sell screen under its own type, and selling one takes it
off the shelf like any other stock movement.


**Inventory** is what you buy. Every material has a **type** — that's how recipes find it —
picked from a dropdown, with **+ New type…** at the bottom to add one on the spot. The
**Types** button on the Inventory tab lists them all, so a type can be added before there's
anything to file under it.

**Counted in** is a dropdown too, grouped into Count (each, pair, pack, bag, sheet, roll),
Length (metre, centimetre, foot, inch), Weight (gram, kilogram, ounce, pound) and Volume
(millilitre, litre, fluid ounce). Recipes do arithmetic on these, so half a metre of ribbon
works exactly as you'd expect.

**How many** follows the unit: things you count (each, pair, pack, bag, sheet, roll) take
whole numbers only, things you measure (metre, gram, litre and the rest) allow decimals.
So you can write off 1.5 m of ribbon but not half a balloon.

There's no "usual cost" to keep by hand. **A new material takes its first batch on the same
form**, and from then on the cost carries over from the newest batch — so "Cost each"
prefills with what you last paid, and that figure is what gets used if you ever oversell.
The list shows "last paid" against each material.

### Finishing a day

Tap the **Selling at** pill and whatever's open sits at the top with what it's taken so
far, how that splits by payment, and what the tray should hold. **Done selling for today**
is the full-width button; **Set the float** and **Out of the tray** sit on the row below,
with the coming-home check under them. While a day is open the "add somewhere else"
buttons are hidden — you're already selling. That shows the day's total, how many things went out and how many were given
away, warns you if anything is still sitting in the ticket, counts the cash tray, and
offers a backup if sales haven't been saved yet.

Closing up only puts the till away: the day is marked **Done**, nothing is deleted, and the
sales stay exactly where they are. It drops off the Coming up list so it stops nagging.
Tapping a closed day in the picker opens it again and clears the mark — handy if someone
comes back after you've packed.

### Re-ordering

**Nearly out** on the Inventory tab is a button, and the only metric on that screen. It
shows how many materials are low, with how many of those are already re-ordered underneath —
so four low and two re-ordered means two still need chasing.

Tapping it lists what's already on its way and what's still running low, with **Order some**
against each. To order something that isn't low, open that material and use **Order some
more**.

Anything on order stops nagging you as nearly out and shows a green chip on its row — "200
on the way · in 4 days", or "3 days late" once the date passes. **On its way** counts the
open orders and flags overdue ones, and a dot appears on the Inventory tab when something
wants chasing.

When it turns up, **It's here** prefills a batch with what you ordered. Correct the count
and the price if the delivery differed, and it goes on the shelf as a dated batch and closes
the order. Cancelling an order puts the material back on the re-order list.

### A material's sheet

Open any material and it's in sections:

- **Details** — name, type, counted in, warn-me level, and an **Active / Inactive** switch.
  Inactive folds it into the collapsed section in Inventory, stops it being offered at the
  counter and stops it being chased when low. Its stock and history stay put.
- **Counts** — inventory on hand and what's on its way, with anything already ordered listed
  underneath, and the order form right there: how many, ordered on, expected delivery date,
  note.
- **Add a batch**, **Write-offs** and **Where it went** are collapsed until you need them.

### Where it went

Open any material, expand **Where it went**, and there's a dated history of every unit in
and out — **Batch purchased** rows carrying that batch's own detail (how much of it is left,
what it cost each, the note), what got made from it and at which market, giveaways and swaps
labelled as such, and anything written off with its reason. Filter it by **Batches**,
**Written off** or **Sales**.

A batch nothing has been used from still carries an ✕ to delete it, for when you mistype
one. Four totals sit above it: on the shelf, bought in, made into
things, written off.

Those totals reconcile. If bought-in minus used minus written-off doesn't match the shelf,
it says so rather than quietly disagreeing with itself — usually a sign a batch was deleted
after something had been used from it.

The Inventory tab carries the same story in short: each row shows what's left, what's been
used, what's been written off, and how many things use it. Finished goods you count get the
same history on their own sheet.

The cost of what got written off lives in **Reports → Written off**, not on the Inventory
screen — Inventory answers "what have I got", Reports answers "what did it cost me".

### Finding things

Both Inventory and Make show compact cards with a search box above them. Inventory searches
names, types and units; Make searches names, the types a product uses and the materials it
names.

An Inventory card shows what's left, how many things use it, and the reorder level if one
is set — plus a chip when it's nearly out, on its way, or left at home. A Make card shows
what it's built from, how many you could make, and what one costs.

### A material's screen

Five sections, the first two open:

- **Details** — name, type, counted in, warn level, and whether it's still **Active**.
  Marking it Inactive folds it into the Inactive section and stops it being offered at the
  counter or chased when low. Its stock and history stay put.
- **Counts** — inventory on hand, what's on its way, and the order form right there: how
  many, ordered on, expected delivery date, note.
- **Add a batch** — collapsed, except on a brand-new material where it opens ready for the
  first batch.
- **Write-offs** — collapsed; the form plus everything written off so far.
- **Where it went** — collapsed; filter by Everything, Batches, Sales or Written off.
  Batch rows are titled **Batch purchased** and carry what's left, the price and the note,
  with an ✕ to delete one nothing has been used from.

### Tidying types

Each type heading on the Inventory tab carries **Make inactive**, which folds it and its
materials into a collapsed **Inactive** section at the bottom. Nothing is lost — stock,
history and the Nearly out count all carry on exactly as before; it's only out of the way.
**Make active** brings it back.

A type with nothing filed under it also gets an **✕** to delete it outright, with the usual
confirmation and a trip through Recently deleted.

## Deleting, and changing your mind

Every delete asks first, in a window naming what goes with it. Nothing is destroyed:
deleted things land in **Safe → Recently deleted**, which keeps the last 40. **Put it back**
restores the whole thing — a material comes back with its batches, a market with its dates
and its sales, and the stock those sales used is taken out of the shelf again so the
numbers still add up. A toast offers **Undo** straight after, for the quick cases.

**Delete forever** in that list is the only one-way door, and it asks again. So does
**Clear everything**, twice — and that one empties Recently deleted too, so a backup is
your only way back from it.

## Protecting your data

The app's working data sits in the iPad's WebKit storage for the home screen app. A few
things worth knowing, since it's not quite as fragile as browser storage usually is:

- A home screen web app has **its own storage, separate from the Safari tab.** Clearing
  Safari's history and website data should not touch it.
- The 7-day inactivity wipe that hits ordinary websites **does not apply** to home screen
  web apps, and the app asks iOS to mark its storage as persistent on every launch.
- It **will** be lost if you delete or offload the home screen app, and iOS can still
  evict it if the iPad runs critically low on space.

So the real copy of your data is the backup file. **Safe → Save a backup** opens the iOS
share sheet — choose **Save to Files** and put it in iCloud Drive. That file lives in the
Files app like any other document, gets picked up by iCloud, and **Load a backup**
rebuilds everything from it on any iPad.

The Safe tab shows how long it's been and how many sales have happened since. Opening a
new event with unsaved sales prompts you too. Habit worth forming: back up at the end of
each event, before you pack down.

**Safe → Spreadsheets → Sales** goes through the same share sheet. One row per line item, with
date, hour, location, event type, options, price mode, discount, reason, cost and profit —
open it in Numbers or Excel if you ever want to slice it a different way.

## If the data goes

Restoring is a full rebuild, not a partial one — items, photos, option layers, every event
and every sale, your currency symbol, and which event was open. Tested end to end: wipe
everything, restore, and the reports come back identical.

If the app itself is gone from the iPad:

1. Reopen `https://YOUR-USERNAME.github.io/stallbook/` in Safari and Add to Home Screen again.
2. Launch it from the icon, go to **Safe → Load a backup**.
3. Pick `stallbook-backup-<date>.json` from the Files app or iCloud Drive.

The one thing you don't get back is anything sold *after* the last backup — that's the
whole reason the Safe tab nags you about it. Backups are small (a stall with a dozen items
and photos is well under a megabyte), so there's no cost to doing it often.

Picking the wrong file is safe. Anything that isn't a Stallbook backup is rejected outright
and your existing data is left alone.

## Changing the app later

Replace `index.html` on GitHub, **and** open `sw.js` and change `stallbook-v1` to
`stallbook-v2`. Without that bump the iPad keeps serving the cached old version.
Then reopen the app twice — once to fetch, once to run the new one.

## Troubleshooting

**"Storage unavailable" on launch** — the page was opened as a local file. It must be
served over https, i.e. the github.io URL.

**Reports look empty** — check the location / event type / date filters at the top.

**A photo won't load** — very large images are shrunk to 520px on save; if the camera
roll picture is a HEIC burst photo, take a normal photo instead.
