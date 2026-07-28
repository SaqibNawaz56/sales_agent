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

