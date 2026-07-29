Read this project proposal properly. We have to build it in the next 7 days.

Start reading the document now. Also check my system setup and tell me if anything in the proposal doesn't make sense or is missing.

I know Day 1 is a lot of work, but we will do it in small chunks. One more thing, everything should run in Docker containers.

Let's put everything in Docker from Day 1 — database, MCP server, API and frontend. Does this change the stdio transport I wrote in my proposal?

Set up the project folders using npm workspaces. Add a docker-compose file with Postgres, and also .gitignore, .dockerignore and a .env.example with the database, Groq and port settings.

Now make the Prisma schema with all 5 tables from my ERD. Use decimal for price and quantity instead of float. Make the normalized name unique so the same product doesn't get added twice by a typo. Also a product should not be deletable if some sale is using it.

Keep the Prisma schema inside the mcp-server package so no other package can access the database directly.

Docker is installed now, you can continue.

Start the database container, run the first migration, and add around 20 real products that a general store would have, with rupee prices. If I run the seed again it should not create duplicate rows.

Check properly that the tables and the products are inside the Docker database and not in my local Postgres.

Now make the MCP server run over HTTP with one simple tool. Make that tool read something from the database instead of just returning a string, so we know the whole thing is working.

Write the name normalize function in only one place and use it in the seed file also, so both always stay the same.

Connect a raw MCP client from a separate process and show me the round trip is working.

I have added the GROQ api key in the .env file, start the next chunk.

Make the api package with Express, LangChain, ChatGroq and the MCP adapter. Load the MCP tools into LangChain and check if the model can call a tool that is on the separate MCP server.

Instead of removing save_sale from the list, only allow the tools we want the model to see. That way if we add a new tool later it will not go to the model automatically.

Set the temperature to 0 so the model gives the same answer every time.

Add an endpoint that shows which tools the agent can see, so we can test it later.

How do I verify that Day 1 is really completed with the Docker containers?

Write a script that checks the running containers, not the code. Also in that script stop the MCP server and check the agent fails, then start it again and check it works.

Make sure the script does not show pass when nothing is running.

Make a prompts.md file and put the prompts of this chat in it, written properly.

Only add the prompts, not the replies you gave.

Just the prompts, remove everything else.

Push the Day 1 work to my GitHub repo. Make sure the .env file does not go up.

Now we will start Day 2. First tell me what the Day 2 tasks are, and give me a plan of how we will build it chunk by chunk.

Yes, go with your suggestion — the agent should only do the extraction and the controller should do the lookups. Start the first chunk.

Make a wrapper for registering tools that also saves every call into the tool_call_logs table. Do this logging part now instead of Day 7, so all the tools we make after this get it automatically.

Now make lookup_product and create_product with Zod schemas. Match on the normalized name, and if the product is not found then return some near matches so we can ask "did you mean sugar?".

Yes, follow through on that — do not show lookup_product and create_product to the model, only the controller should call them.

Now make find_or_create_customer. It should not create the customer on its own, only when we clearly ask for it, otherwise a typo will make a duplicate customer and mess up his whole history.

Now make save_sale. It should write the sale and the line items in one transaction, save the price on the line item, and it must stay off the model's tool list.

Now write the extraction prompt so a sentence like "2kg rice and 2kg sugar to Ali" gives the customer and the items properly. Also make a test file with different sentences so we can check it every time we change the prompt.

Fix the dozen problem — "1 dozen eggs" should be quantity 1 with unit dozen, not quantity 12.

Add retry with backoff for the Groq rate limit, and put some delay between the test calls so a rate limit error does not look like a wrong answer.

Show me properly that "2kg rice and 2kg sugar to Ali" gives a correct structured object using the MCP tools, not just a test saying it passed.

Push the Day 2 work to GitHub.

First tell me the Day 3 tasks, then give me the plan chunk by chunk.

Yes go with your suggestions — use a separate small prompt for the clarification answers, ask about one gap per turn, and treat the customer as a draft-level check. Start chunk 1.

Make the draft sale object and a session store on the server side. Keep the draft separate from the LangChain message history.

Now make the per-item checklist — product known, quantity present, price resolved. Keep it a pure function with no model and no database so it can be tested on its own.

Also make the resolve step that fills the draft with the catalogue facts using the MCP tools.

Now make the targeted questions. Use templates instead of asking the model, so the wording stays the same every time and we don't waste tokens.

Now finish the rest of chunk 3 — the small prompt that reads the owner's answer, and the part that applies it to only the item we asked about.

Now make the controller that ties it all together — extract, resolve, check, then either ask one question or show the summary.

Fix the oil problem. The catalogue says "Cooking Oil" but the owner says "oil", so the lookup fails and it asks the wrong question.

Also fix the bug where answering "2 litres" to a product question creates a product named "2 litres".

Now make the CLI so I can type the whole flow myself. It should also work with piped input so we can use it in the test script.

Now write verify-day3.ps1. It must check that exactly one question is asked, not just one or more. Also clean up the test customer so the database is left as it was.



