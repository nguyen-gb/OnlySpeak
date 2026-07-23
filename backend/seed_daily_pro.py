import argparse
import asyncio
import os
from sqlalchemy import select, delete
from app.database import async_session_maker
from app.models import (
    Conversation,
    ConversationLine,
    Level,
    PracticeAttempt,
    Speaker,
    Topic,
    UserProgress,
)

async def seed(*, reset: bool = False):
    async with async_session_maker() as session:
        if reset:
            if os.getenv("ONLYSPEAK_ALLOW_DESTRUCTIVE_SEED") != "yes-delete-data":
                raise RuntimeError(
                    "Refusing destructive seed. Set "
                    "ONLYSPEAK_ALLOW_DESTRUCTIVE_SEED=yes-delete-data and pass --reset."
                )
            print("Reset explicitly authorized; deleting curriculum and progress...")
            await session.execute(delete(PracticeAttempt))
            await session.execute(delete(UserProgress))
            await session.execute(delete(ConversationLine))
            await session.execute(delete(Conversation))
            await session.execute(delete(Topic))
            await session.flush()

        # Define 18 Topics & 90 Conversations (5 conversations per topic)
        curriculum = [
            # ==========================================
            # LEVEL 1: BEGINNER (30 Conversations, Topics 1-6)
            # ==========================================
            {
                "topic": {
                    "title": "Greetings & Introductions",
                    "description": "Learn to say hello, introduce yourself and others, and say goodbye politely.",
                    "icon": "🤝",
                    "level": Level.BEGINNER,
                    "sort_order": 1,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Saying Hello in the Morning",
                        "description": "Greeting a classmate or coworker in the morning.",
                        "situation": "Meeting in the hallway before class starts.",
                        "role_a_name": "Anna", "role_b_name": "Tom",
                        "level": Level.BEGINNER, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Good morning, Tom! How are you doing today?", "Say it with a bright, morning energy."),
                            ("B", "Hi Anna! I'm doing great, thank you. How about you?", "Sound cheerful and friendly."),
                            ("A", "I'm good too. Did you finish the homework for today?", "Keep it natural and curious."),
                            ("B", "Yes, I did. It was a bit hard, but I got it done.", "Express minor relief."),
                            ("A", "Awesome. Let's go to class together then.", "Welcoming and friendly tone.")
                        ]
                    },
                    {
                        "title": "Meeting at a Social Party",
                        "description": "Introducing yourself to a new face at a casual gathering.",
                        "situation": "Standing near the drinks table at a mutual friend's house party.",
                        "role_a_name": "Leo", "role_b_name": "Chloe",
                        "level": Level.BEGINNER, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Hi, I'm Leo. I don't think we've met before.", "Friendly and open posture in your voice."),
                            ("B", "Hi Leo! I'm Chloe. Nice to meet you.", "Smile as you speak. Emphasize 'Nice to meet you'."),
                            ("A", "Nice to meet you too, Chloe. How do you know our host, Mark?", "Keep the small talk rolling."),
                            ("B", "Mark and I work in the same office. How about you?", "Answer naturally, then pass the question back."),
                            ("A", "Oh, Mark is my college roommate! Small world.", "Express pleasant surprise.")
                        ]
                    },
                    {
                        "title": "Introducing a Coworker",
                        "description": "Introducing a new colleague to an established teammate.",
                        "situation": "In the office common area.",
                        "role_a_name": "David", "role_b_name": "Sofia",
                        "level": Level.BEGINNER, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Sofia, this is Jack. He is joining our design team today.", "Speak clearly. Introduce the colleague politely."),
                            ("B", "Hi Jack! Welcome aboard. It's great to have you here.", "Show warm enthusiasm and welcome."),
                            ("A", "Jack just moved here from San Francisco last week.", "Share a helpful detail to break the ice."),
                            ("B", "Oh, San Francisco is fantastic! I hope you like our city.", "Express positive feelings about their previous city."),
                            ("A", "Thanks Sofia! Let me know if you want to grab lunch later.", "Suggest a friendly follow-up action.")
                        ]
                    },
                    {
                        "title": "Running into an Old Friend",
                        "description": "Bumping into a friend you haven't seen in a long time.",
                        "situation": "Walking in a public park on the weekend.",
                        "role_a_name": "Emma", "role_b_name": "Ryan",
                        "level": Level.BEGINNER, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Oh my gosh, Ryan? Is that you?", "Express sudden surprise and high pitch."),
                            ("B", "Emma! Wow, long time no see! How have you been?", "Show equal surprise and positive volume."),
                            ("A", "I've been great! It has been almost two years, hasn't it?", "Reflect on the time elapsed naturally."),
                            ("B", "At least! We absolutely need to catch up. Are you free for coffee?", "Suggest a friendly get-together enthusiastically."),
                            ("A", "I'd love that. Here is my number, text me later!", "Hand over contact details with a happy tone.")
                        ]
                    },
                    {
                        "title": "Saying Goodbye Politely",
                        "description": "Ending a pleasant conversation and departing.",
                        "situation": "At the bus stop after chatting.",
                        "role_a_name": "Lucy", "role_b_name": "Ben",
                        "level": Level.BEGINNER, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Well, my bus is coming. It was really nice talking to you, Ben.", "Gentle transition to leaving. Friendly tone."),
                            ("B", "Same here, Lucy! Safe travels and hope to see you again soon.", "Show genuine goodwill."),
                            ("A", "Thanks! Have a great evening, and take care.", "Deliver standard farewell wishes warmly."),
                            ("B", "Thanks, you too! Goodbye!", "Wave and sound happy.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Food & Drinks",
                    "description": "Essential expressions for ordering coffee, bakery items, asking for the menu, and paying.",
                    "icon": "☕",
                    "level": Level.BEGINNER,
                    "sort_order": 2,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Ordering a Morning Coffee",
                        "description": "Simple routine transaction at a cafe counter.",
                        "situation": "At the counter of a busy local coffee shop.",
                        "role_a_name": "Barista", "role_b_name": "Customer",
                        "level": Level.BEGINNER, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Hello! What can I get started for you today?", "Welcome the customer with a pleasant voice."),
                            ("B", "Hi, can I get a medium hot latte with oat milk, please?", "Order clearly and politely."),
                            ("A", "Sure! Would you like any sugar or syrup in that?", "Offer extras in an engaging tone."),
                            ("B", "No, just the latte, thank you.", "Polite denial of options."),
                            ("A", "You got it. That will be $4.50. You can tap your card right here.", "State price clearly and instruct payment.")
                        ]
                    },
                    {
                        "title": "Buying a Fresh Snack",
                        "description": "Ordering a pastry at a bakery.",
                        "situation": "Standing in front of a bakery display case.",
                        "role_a_name": "Baker", "role_b_name": "Customer",
                        "level": Level.BEGINNER, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Good morning! Those croissants just came out of the oven.", "Introduce fresh items enthusiastically."),
                            ("B", "Oh, they smell amazing! I'll take two chocolate croissants, please.", "Express appreciation of smell and order."),
                            ("A", "Perfect. Would you like them warmed up?", "Offer to heat them up politely."),
                            ("B", "Yes, please. That would be great.", "Polite confirmation."),
                            ("A", "Alright, here they are! Enjoy your treats.", "Hand over the pastry bag with a friendly smile.")
                        ]
                    },
                    {
                        "title": "Asking about the Menu",
                        "description": "Checking ingredients in a sandwich.",
                        "situation": "At a sandwich shop counter.",
                        "role_a_name": "Server", "role_b_name": "Customer",
                        "level": Level.BEGINNER, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Hi! Are you ready to order or do you have any questions?", "Show helpful readiness."),
                            ("B", "Hi, what comes on the Turkey Club sandwich?", "Inquire about ingredients clearly."),
                            ("A", "It comes with roasted turkey, bacon, lettuce, tomato, and mayo.", "List the ingredients systematically."),
                            ("B", "Can I get that without bacon, please?", "Polite customization request."),
                            ("A", "Of course, no bacon. It will be ready in just five minutes.", "Accommodating and efficient response.")
                        ]
                    },
                    {
                        "title": "Ordering Water at a Diner",
                        "description": "Simple table service request.",
                        "situation": "Sitting down at a diner table.",
                        "role_a_name": "Waiter", "role_b_name": "Diner",
                        "level": Level.BEGINNER, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Hi there, welcome! Can I bring you something to drink to start?", "Friendly table greeting."),
                            ("B", "Hi, could we get two glasses of ice water with lemon, please?", "Make a polite drink request."),
                            ("A", "Certainly. I will bring those right over. Do you need a menu?", "Confirm and offer the menu."),
                            ("B", "Yes, please. We'd like to look at the lunch options.", "Polite confirmation of menus request.")
                        ]
                    },
                    {
                        "title": "Asking for the Bill",
                        "description": "Getting the check at a fast-food counter.",
                        "situation": "Finishing your meal at the counter.",
                        "role_a_name": "Cashier", "role_b_name": "Diner",
                        "level": Level.BEGINNER, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, could we have the check, please?", "Ask for the check politely."),
                            ("A", "Sure, here is your bill. No rush at all.", "Hand over the check with a pleasant smile."),
                            ("B", "Can we pay together or do you prefer separate?", "Inquire about billing options."),
                            ("A", "I can easily separate it if you'd like, or combine it.", "Offer convenient solutions."),
                            ("B", "We'll pay together. Here is my credit card.", "Present card confidently.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Everyday Shopping",
                    "description": "Master shopping terms: asking for prices, finding sizes, choosing colors, and checkout.",
                    "icon": "🛍️",
                    "level": Level.BEGINNER,
                    "sort_order": 3,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Asking for Prices",
                        "description": "Inquiring about the cost of a souvenir.",
                        "situation": "At a local gift shop.",
                        "role_a_name": "Shop Assistant", "role_b_name": "Customer",
                        "level": Level.BEGINNER, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, how much is this handmade mug?", "Ask for the price politely."),
                            ("A", "That mug is fifteen dollars, and it's dishwasher safe.", "State cost and add a helpful feature."),
                            ("B", "Oh, that's a good price. Is there a discount if I buy two?", "Ask about promotions naturally."),
                            ("A", "Yes! We have a buy one, get one ten percent off today.", "Share sales terms cheerfully."),
                            ("B", "Great, I'll take these two then.", "Confirm purchase happily.")
                        ]
                    },
                    {
                        "title": "Finding a Size",
                        "description": "Looking for the right fit at a clothing store.",
                        "situation": "Standing next to a clothing rack.",
                        "role_a_name": "Sales Clerk", "role_b_name": "Shopper",
                        "level": Level.BEGINNER, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Hello! Let me know if you need help finding any sizes.", "Offer assistance warmly."),
                            ("B", "Hi, I really like this jacket. Do you have it in a medium?", "Inquire about size availability."),
                            ("A", "Let me check the back room for you... Yes, we have one medium left!", "Check inventory and report good news."),
                            ("B", "Oh, perfect! Can I try it on somewhere?", "Ask for fitting rooms eagerly."),
                            ("A", "Sure, the fitting rooms are just around that corner.", "Direct them to the fitting rooms clearly.")
                        ]
                    },
                    {
                        "title": "Choosing Colors",
                        "description": "Inquiring about alternative item colors.",
                        "situation": "At a hat shop.",
                        "role_a_name": "Clerk", "role_b_name": "Shopper",
                        "level": Level.BEGINNER, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, does this blue sun hat come in black or beige?", "Ask about color options clearly."),
                            ("A", "Yes, we have it in both black and beige on the shelf over there.", "Point out color locations helpfully."),
                            ("B", "Ah, yes, I see them now. I think the beige one looks nicer.", "Self-evaluate options aloud."),
                            ("A", "I agree, beige is very popular this summer.", "Validate their choice politely.")
                        ]
                    },
                    {
                        "title": "Paying at the Cashier",
                        "description": "Completing a basic checkout transaction.",
                        "situation": "Standing at the cash register.",
                        "role_a_name": "Cashier", "role_b_name": "Customer",
                        "level": Level.BEGINNER, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Hello! Did you find everything okay today?", "Standard greeting. Warm service tone."),
                            ("B", "Yes, everything was very easy to find, thank you.", "Friendly response."),
                            ("A", "Excellent. That will be twenty-two dollars exactly.", "State transaction cost clearly."),
                            ("B", "Here is a thirty-dollar bill.", "Present cash clearly."),
                            ("A", "Thank you. And here is eight dollars in change.", "Hand back change politely.")
                        ]
                    },
                    {
                        "title": "Asking for a Receipt",
                        "description": "Ensuring you get proof of purchase.",
                        "situation": "Concluding a credit card payment.",
                        "role_a_name": "Cashier", "role_b_name": "Customer",
                        "level": Level.BEGINNER, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Your payment went through. Would you like your receipt in the bag?", "Ask about receipt placement."),
                            ("B", "Actually, could you print it out and hand it to me? I need it for work.", "Specify request politely."),
                            ("A", "Sure thing! Here is your printed copy.", "Provide receipt immediately with a smile."),
                            ("B", "Thank you very much. Have a great day!", "Warm exit greeting.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Travel & Directions",
                    "description": "Essential navigational English: restrooms, bus stops, tickets, and simple walking instructions.",
                    "icon": "🗺️",
                    "level": Level.BEGINNER,
                    "sort_order": 4,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Finding a Public Restroom",
                        "description": "Urgent navigational query.",
                        "situation": "At a shopping mall information desk.",
                        "role_a_name": "Info Desk", "role_b_name": "Visitor",
                        "level": Level.BEGINNER, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, where is the nearest restroom, please?", "Polite, direct question."),
                            ("A", "It's on the second floor, right next to the food court.", "Provide clear locations."),
                            ("B", "Is there an elevator nearby, or do I take the stairs?", "Ask for access methods."),
                            ("A", "The elevators are right behind you, next to the entrance.", "Point to immediate elevators."),
                            ("B", "Got it. Thank you so much!", "Express quick appreciation.")
                        ]
                    },
                    {
                        "title": "Finding the Bus Stop",
                        "description": "Asking a passerby for transit directions.",
                        "situation": "On a suburban sidewalk.",
                        "role_a_name": "Local Resident", "role_b_name": "Lost Traveler",
                        "level": Level.BEGINNER, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, do you know where the bus stop for line ten is?", "Ask for specific bus stop."),
                            ("A", "Oh, it's just across the street, in front of the supermarket.", "Point out the location clearly."),
                            ("B", "Ah, I see the blue sign now. Thank you!", "Express relief upon finding the landmark."),
                            ("A", "No problem. The bus should arrive in ten minutes.", "Provide useful timetable context.")
                        ]
                    },
                    {
                        "title": "Buying a Metro Ticket",
                        "description": "Buying a single-ride ticket at a kiosk station.",
                        "situation": "At a busy subway terminal window.",
                        "role_a_name": "Agent", "role_b_name": "Passenger",
                        "level": Level.BEGINNER, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Next in line, please! Where are you traveling today?", "Call next customer and ask destination."),
                            ("B", "Hi, I need a single-ride ticket to Central Station.", "Order ticket clearly."),
                            ("A", "That will be three dollars. Cash or card?", "State cost and ask payment preference."),
                            ("B", "Card, please.", "Direct answer."),
                            ("A", "Tap your card here. Here is your ticket. Safe travels!", "Provide ticket and pleasant farewell.")
                        ]
                    },
                    {
                        "title": "Is the Museum Nearby?",
                        "description": "Estimating walking distances.",
                        "situation": "Outside a public library.",
                        "role_a_name": "Resident", "role_b_name": "Tourist",
                        "level": Level.BEGINNER, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, is the Science Museum within walking distance?", "Inquire about walking feasibility."),
                            ("A", "Yes, it is. It's only about a ten-minute walk straight down this road.", "Confirm and give time estimate."),
                            ("B", "Great! I prefer walking over taking a taxi.", "Share personal travel preference."),
                            ("A", "Me too. Enjoy the beautiful weather!", "Polite agreement and wishing good day.")
                        ]
                    },
                    {
                        "title": "Lost Tourist Situation",
                        "description": "Basic map inquiry when disoriented.",
                        "situation": "Standing on a street corner looking at a phone map.",
                        "role_a_name": "Helper", "role_b_name": "Lost Tourist",
                        "level": Level.BEGINNER, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Hi, do you need some help finding your way?", "Proactively offer assistance."),
                            ("B", "Oh, yes, please! I'm trying to find the City Square, but my GPS is lost.", "Accept assistance and explain issue."),
                            ("A", "No worries, it's just two blocks that way, turn right.", "Provide simple direction instructions."),
                            ("B", "Ah, so close! Thank you for pointing me in the right direction.", "Delighted relief.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Family & Home",
                    "description": "Learn to talk about your home, family members, pets, and basic household routines.",
                    "icon": "🏠",
                    "level": Level.BEGINNER,
                    "sort_order": 5,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Do You Have Siblings?",
                        "description": "Discussing family members casually.",
                        "situation": "Chatting during a school coffee break.",
                        "role_a_name": "Jane", "role_b_name": "Mike",
                        "level": Level.BEGINNER, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "So, Mike, do you have any brothers or sisters?", "Ask standard family icebreaker."),
                            ("B", "Yes, I have an older brother and a younger sister. How about you?", "Describe siblings and return question."),
                            ("A", "I'm an only child, so my house was always very quiet.", "Contrast and describe household volume."),
                            ("B", "Oh, my house was always super noisy! But it was fun.", "Share contrasting lively household memory.")
                        ]
                    },
                    {
                        "title": "Describing Your Pet Cat",
                        "description": "Talking about family pets.",
                        "situation": "Showing photos on your phone.",
                        "role_a_name": "Lily", "role_b_name": "Jack",
                        "level": Level.BEGINNER, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Who is this cute fluffy animal in your photo?", "Ask about phone photo enthusiastically."),
                            ("B", "That's my cat, Whiskers. She's three years old and very lazy.", "Describe pet name, age, and behavior."),
                            ("A", "Oh, she has beautiful green eyes! Does she sleep a lot?", "Compliment pet and ask follow-up."),
                            ("B", "Yes, she sleeps in the sun all day long.", "Confirm cute pet habit.")
                        ]
                    },
                    {
                        "title": "House or Apartment?",
                        "description": "Describing your living situation.",
                        "situation": "Meeting someone in a new neighborhood.",
                        "role_a_name": "Nora", "role_b_name": "Sam",
                        "level": Level.BEGINNER, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Do you live in a house or an apartment around here?", "Inquire about housing type."),
                            ("B", "I live in a small apartment on the third floor. It's cozy.", "Describe apartment details."),
                            ("A", "Is it quiet? My apartment is very noisy due to traffic.", "Ask about noise levels to compare."),
                            ("B", "Yes, it faces a small courtyard, so it's very quiet.", "Confirm peaceful living situation.")
                        ]
                    },
                    {
                        "title": "What Do Your Parents Do?",
                        "description": "Talking about parents' jobs.",
                        "situation": "Casual social dinner chat.",
                        "role_a_name": "Alice", "role_b_name": "Bob",
                        "level": Level.BEGINNER, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Bob, what do your parents do for work?", "Polite job question about family."),
                            ("B", "My father is a high school math teacher, and my mother is a nurse.", "Describe parents' professions clearly."),
                            ("A", "That's wonderful. Being a teacher and a nurse are highly respected jobs.", "Validate and compliment."),
                            ("B", "Thanks, they both love helping people.", "Explain parents' motivation proudly.")
                        ]
                    },
                    {
                        "title": "Who Does the Dishes?",
                        "description": "Deciding on simple chores with a roommate.",
                        "situation": "In the kitchen after eating dinner.",
                        "role_a_name": "Roommate A", "role_b_name": "Roommate B",
                        "level": Level.BEGINNER, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Thanks for cooking dinner, it was delicious! Who is doing the dishes?", "Express appreciation and raise chore question."),
                            ("B", "Well, since I cooked, would you mind washing the dishes today?", "Negotiate chore division logically."),
                            ("A", "No problem at all. I'll clean the plates and wipe the counter.", "Accept work cooperatively."),
                            ("B", "Awesome! I'll go sit down and relax. Thank you!", "Express relief and gratitude.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Weather & Daily Routines",
                    "description": "Talk about local weather, what time you wake up, and plans for the season.",
                    "icon": "☀️",
                    "level": Level.BEGINNER,
                    "sort_order": 6,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Is It Going to Rain?",
                        "description": "Simple weather forecast chat.",
                        "situation": "Looking out the window in the morning.",
                        "role_a_name": "Tim", "role_b_name": "Sue",
                        "level": Level.BEGINNER, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Look at those dark clouds. Is it going to rain today?", "Observe clouds and ask opinion."),
                            ("B", "Yes, the weather forecast says there is an eighty percent chance of rain.", "Cite weather report statistics."),
                            ("A", "I'd better bring my umbrella with me then.", "Decide on protective action."),
                            ("B", "Good idea, and wear a jacket because it's windy.", "Give helpful clothing advice.")
                        ]
                    },
                    {
                        "title": "What Time Do You Wake Up?",
                        "description": "Sharing daily wake-up routines.",
                        "situation": "At the gym early in the morning.",
                        "role_a_name": "Early Bird", "role_b_name": "Late Raiser",
                        "level": Level.BEGINNER, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "You're here early! What time do you usually wake up?", "Compliment early arrival and ask time."),
                            ("B", "I wake up at five-thirty AM every day to exercise before work. You?", "Describe early schedule and return question."),
                            ("A", "Wow, that's early! I usually sleep until seven AM.", "Express mild shock and share routine."),
                            ("B", "It was hard at first, but now I love early mornings.", "Share personal growth journey.")
                        ]
                    },
                    {
                        "title": "My Quiet Evening Routine",
                        "description": "Describing winding down after work.",
                        "situation": "Chatting at the office before leaving.",
                        "role_a_name": "May", "role_b_name": "Leo",
                        "level": Level.BEGINNER, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "What do you usually do in the evenings after you get home?", "Ask about evening activities."),
                            ("B", "I make a simple dinner, read a book, and go to bed by ten PM.", "List calm evening activities."),
                            ("A", "That sounds very peaceful. I usually watch TV or play video games.", "Describe contrasting tech-based routine."),
                            ("B", "Reading helps me sleep much better than looking at screens.", "Provide constructive routine advice.")
                        ]
                    },
                    {
                        "title": "Weekend Sleeping Habits",
                        "description": "Talking about sleeping in on Saturdays.",
                        "situation": "Friday afternoon casual conversation.",
                        "role_a_name": "Jane", "role_b_name": "Luke",
                        "level": Level.BEGINNER, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Do you have any exciting plans for this Saturday?", "Inquire about weekend plans."),
                            ("B", "Not really. My main plan is to sleep in until ten AM.", "Describe sleeping plan humorously."),
                            ("A", "That sounds amazing. I have to wake up early to take my kids to soccer.", "Contrast with busy family schedule."),
                            ("B", "I will think of you while I am sleeping in!", "Friendly, playful teasing.")
                        ]
                    },
                    {
                        "title": "Summer or Winter?",
                        "description": "Sharing seasonal preferences.",
                        "situation": "Drinking hot tea on a cold day.",
                        "role_a_name": "Summer Fan", "role_b_name": "Winter Fan",
                        "level": Level.BEGINNER, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "I hate this cold weather. Do you prefer summer or winter?", "Express dislike of cold and ask preference."),
                            ("B", "I actually love winter! I enjoy snowboarding and hot chocolate.", "Defend winter with cozy activities."),
                            ("A", "I prefer hot sunny days on the beach, doing absolutely nothing.", "Describe perfect summer scene."),
                            ("B", "Well, that does sound pretty nice too!", "Polite agreement on summer qualities.")
                        ]
                    }
                ]
            },

            # ==========================================
            # LEVEL 2: INTERMEDIATE (30 Conversations, Topics 7-12)
            # ==========================================
            {
                "topic": {
                    "title": "Social Life & Making Plans",
                    "description": "Learn to invite friends, politely decline, reschedule, and host simple dinners.",
                    "icon": "🎉",
                    "level": Level.INTERMEDIATE,
                    "sort_order": 7,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Inviting a Friend to a Movie",
                        "description": "Suggesting a cinema outing on the weekend.",
                        "situation": "Chatting online or via phone.",
                        "role_a_name": "Inviter", "role_b_name": "Invitee",
                        "level": Level.INTERMEDIATE, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Hey! Are you free this Saturday? There's a new action movie playing.", "Open invitation with a friendly tone."),
                            ("B", "Hey! Saturday afternoon works for me. What time is the showing?", "Confirm availability and ask about logistics."),
                            ("A", "There is a screening at three PM and another at six PM. Which do you prefer?", "Present time slots clearly."),
                            ("B", "Let's go for the three PM showing so we can grab dinner afterwards.", "Choose slot and propose a nice follow-up activity."),
                            ("A", "Sounds like a plan! I'll book the tickets online now.", "Confirm happily and outline next step.")
                        ]
                    },
                    {
                        "title": "Declining an Invitation Politely",
                        "description": "Saying no to plans due to prior commitments.",
                        "situation": "Chatting in a hallway.",
                        "role_a_name": "Inviter", "role_b_name": "Busy Friend",
                        "level": Level.INTERMEDIATE, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Hey, we are going hiking this Sunday. Would you like to join us?", "Propose group activity warmly."),
                            ("B", "Oh, I'd love to, but I've already made plans to visit my parents this weekend.", "Politely express regret and provide a real reason."),
                            ("A", "Ah, no worries at all! Family comes first. Have a good trip.", "Reassure them and validate their reason."),
                            ("B", "Thank you! Please let me know next time you guys plan a hike.", "Keep the door open for future opportunities.")
                        ]
                    },
                    {
                        "title": "Rescheduling a Coffee Date",
                        "description": "Changing plans last minute because of work.",
                        "situation": "Sending a voice message or call.",
                        "role_a_name": "Delayed Friend", "role_b_name": "Flexible Friend",
                        "level": Level.INTERMEDIATE, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Hey, I'm so sorry, but something urgent came up at work. Can we postpone our coffee date?", "Apologize sincerely and explain work issue."),
                            ("B", "No problem at all, I completely understand. Work is important. When are you free next?", "Reassure them and ask for alternative slots."),
                            ("A", "How about next Tuesday at the same time? Things should be calmer by then.", "Propose specific date and justify choice."),
                            ("B", "Tuesday works perfectly for me. Good luck with your work project!", "Confirm date and offer positive encouragement.")
                        ]
                    },
                    {
                        "title": "Hosting a Simple Dinner",
                        "description": "Asking about dietary preferences before cooking.",
                        "situation": "Planning a menu with a guest over the phone.",
                        "role_a_name": "Host", "role_b_name": "Guest",
                        "level": Level.INTERMEDIATE, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Hi! I'm planning the dinner menu for this Friday. Do you have any food allergies?", "Inquire about dietary restrictions proactively."),
                            ("B", "I'm actually vegetarian, so I don't eat meat, but fish is totally fine.", "Clarify diet terms clearly and positively."),
                            ("A", "Oh, perfect! I'll make a nice baked salmon with roasted vegetables.", "Suggest a delicious menu fitting their diet."),
                            ("B", "That sounds absolutely delicious! Can I bring any drinks or dessert?", "Express enthusiasm and offer to contribute.")
                        ]
                    },
                    {
                        "title": "Choosing a Birthday Gift",
                        "description": "Discussing ideas for a mutual friend's birthday.",
                        "situation": "Walking around a department store.",
                        "role_a_name": "Friend A", "role_b_name": "Friend B",
                        "level": Level.INTERMEDIATE, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Mark's birthday is next week. What should we get him?", "Initiate gift brainstorming."),
                            ("B", "He has been talking about starting gardening lately. Maybe a nice plant?", "Propose creative idea based on interests."),
                            ("A", "That's a fantastic idea! Let's get him a bonsai tree or a cooking book.", "Build on the suggestion enthusiastically."),
                            ("B", "A bonsai tree is perfect. It's beautiful and fits his office table.", "Select the best option and justify.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Dining Out & Culinary",
                    "description": "How to book tables, ask for suggestions, handle food issues, and split the bill.",
                    "icon": "🍝",
                    "level": Level.INTERMEDIATE,
                    "sort_order": 8,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Booking a Table by Phone",
                        "description": "Making a weekend table reservation.",
                        "situation": "Calling a popular local restaurant.",
                        "role_a_name": "Hostess", "role_b_name": "Diner",
                        "level": Level.INTERMEDIATE, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Good afternoon, Bella Italia. How can I help you today?", "Professional restaurant greeting."),
                            ("B", "Hi, I'd like to reserve a table for four people for this Saturday evening, please.", "State booking size and date clearly."),
                            ("A", "Certainly. We have tables available at six-thirty PM or nine PM. Which do you prefer?", "Present available slots politely."),
                            ("B", "Six-thirty PM would be perfect, under the name Miller.", "Confirm slot and give booking name."),
                            ("A", "Excellent, Mr. Miller. Your table is booked for Saturday at six-thirty PM. See you then!", "Confirm and close professionally.")
                        ]
                    },
                    {
                        "title": "Asking for Server Recommendation",
                        "description": "Checking the restaurant specialties.",
                        "situation": "Looking at the menu at the table.",
                        "role_a_name": "Server", "role_b_name": "Diner",
                        "level": Level.INTERMEDIATE, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Are you ready to order, or do you have any questions about the specials?", "Polite check-in by server."),
                            ("B", "Everything looks so good! What is your most popular dish here?", "Ask for recommendation enthusiastically."),
                            ("A", "Our signature dish is the garlic butter seafood pasta. It's made fresh daily.", "Proudly present signature dish details."),
                            ("B", "Oh, that sounds amazing. I'll take the garlic butter seafood pasta, please.", "Accept suggestion and order confidently.")
                        ]
                    },
                    {
                        "title": "Reporting a Food Issue",
                        "description": "Politely complaining about cold food.",
                        "situation": "At the dining table during dinner.",
                        "role_a_name": "Server", "role_b_name": "Diner",
                        "level": Level.INTERMEDIATE, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, sorry to complain, but my steak is quite cold inside.", "Polite but direct complaint."),
                            ("A", "Oh, I apologize sincerely for that. Let me take it back to the kitchen and heat it up.", "Apologize immediately and propose remedy."),
                            ("B", "Thank you, I appreciate it. The flavor is great, though.", "Express gratitude and soften with positive comment."),
                            ("A", "Of course, I'll have the chef prepare a fresh one right away to make it right.", "Go above and beyond to satisfy guest.")
                        ]
                    },
                    {
                        "title": "Complimenting the Chef",
                        "description": "Leaving feedback at the end of the meal.",
                        "situation": "Paying the bill at the table.",
                        "role_a_name": "Server", "role_b_name": "Diner",
                        "level": Level.INTERMEDIATE, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "How was everything with your meal tonight?", "Standard server follow-up."),
                            ("B", "The food was absolutely outstanding! The salmon was cooked to perfection.", "Deliver strong, enthusiastic praise."),
                            ("A", "That is so kind of you to say. I will definitely let the chef know!", "React with warm gratitude."),
                            ("B", "Please do. We will definitely be coming back here soon.", "Express future loyalty.")
                        ]
                    },
                    {
                        "title": "Splitting the Bill smoothly",
                        "description": "Dividing the check among friends.",
                        "situation": "At the end of a group dinner.",
                        "role_a_name": "Friend A", "role_b_name": "Friend B",
                        "level": Level.INTERMEDIATE, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Alright, here is the check. Shall we split it evenly or calculate separately?", "Raise check splitting options."),
                            ("B", "Let's just split it evenly. It's much easier and faster.", "Propose simple equal split."),
                            ("A", "Sure! It comes to thirty dollars per person. I can pay and you can Venmo me.", "Suggest convenient digital payment solution."),
                            ("B", "Perfect. I'll send you the money right now. Thanks for handling it!", "Confirm, execute transfer, and thank.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Health & Medical Care",
                    "description": "Describe medical symptoms, buy medicine, call in sick, and get checkups.",
                    "icon": "🏥",
                    "level": Level.INTERMEDIATE,
                    "sort_order": 9,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Describing Cold Symptoms",
                        "description": "Explaining illness to a doctor.",
                        "situation": "At a routine doctor consultation.",
                        "role_a_name": "Doctor", "role_b_name": "Patient",
                        "level": Level.INTERMEDIATE, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Good morning. What brings you in today?", "Professional, welcoming doctor tone."),
                            ("B", "I've been feeling very congested, and I have a bad sore throat and fever since yesterday.", "List physical symptoms clearly."),
                            ("A", "Let me check your temperature and listen to your lungs. Have you been coughing?", "Instruct basic examination steps."),
                            ("B", "Yes, a dry cough, mostly at night which keeps me awake.", "Provide specific symptom timing details.")
                        ]
                    },
                    {
                        "title": "Buying Cold Medicine",
                        "description": "Interacting with a pharmacist.",
                        "situation": "Standing at the pharmacy counter.",
                        "role_a_name": "Pharmacist", "role_b_name": "Customer",
                        "level": Level.INTERMEDIATE, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("B", "Hi, I need something for a sore throat and chest congestion, please.", "Ask for medicine category."),
                            ("A", "I recommend this syrup. Take two teaspoons every six hours.", "Recommend product and explain dosage clearly."),
                            ("B", "Does this medicine cause drowsiness? I need to drive to work.", "Ask about side effects practically."),
                            ("A", "Yes, it can make you sleepy. If you drive, try this non-drowsy tablet version instead.", "Offer safer alternative based on lifestyle.")
                        ]
                    },
                    {
                        "title": "Calling in Sick to Work",
                        "description": "Notifying your boss about sudden illness.",
                        "situation": "Phone call to your direct supervisor.",
                        "role_a_name": "Manager", "role_b_name": "Employee",
                        "level": Level.INTERMEDIATE, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Hi Alex, is everything okay?", "Inquire about well-being kindly."),
                            ("B", "Hi Boss, I'm calling to let you know I woke up with a high fever and cannot come to work today.", "Explain situation directly and professionally."),
                            ("A", "I'm sorry to hear that. Please rest up and don't worry about work. I'll cover your tasks.", "Express sympathy and offer workload support."),
                            ("B", "Thank you so much. I will keep you updated on how I feel tomorrow.", "Express gratitude and commit to updates.")
                        ]
                    },
                    {
                        "title": "Booking an Eye Exam",
                        "description": "Arranging a vision checkup.",
                        "situation": "Calling an optometrist clinic.",
                        "role_a_name": "Receptionist", "role_b_name": "Patient",
                        "level": Level.INTERMEDIATE, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Vision Center. How can I help you today?", "Professional clinic greeting."),
                            ("B", "Hi, I'd like to book a routine eye exam. I think my glasses prescription has changed.", "State purpose of exam directly."),
                            ("A", "Certainly. We have an opening this Thursday at four PM. Does that work?", "Offer specific scheduling slot."),
                            ("B", "Thursday at four PM is perfect. Please sign me up.", "Confirm and secure appointment.")
                        ]
                    },
                    {
                        "title": "Describing a Toothache",
                        "description": "Explaining pain to a dental clinic clerk.",
                        "situation": "At the dental receptionist desk.",
                        "role_a_name": "Receptionist", "role_b_name": "Patient",
                        "level": Level.INTERMEDIATE, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Hello! Do you have an appointment with us today?", "Friendly dental greeting."),
                            ("B", "No, but I have a severe toothache in my back molar. Is it possible to see the dentist today?", "Explain dental emergency and ask for urgent slot."),
                            ("A", "Let me check... Yes, we had a cancellation. We can fit you in at eleven AM today.", "Check roster and offer immediate cancellation slot."),
                            ("B", "Oh, thank goodness! I will wait right here. Thank you.", "Delighted relief.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Work & Office",
                    "description": "Standard business communication: office tours, requesting help, weekly sync, and requesting time off.",
                    "icon": "💼",
                    "level": Level.INTERMEDIATE,
                    "sort_order": 10,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Welcoming a New Team Member",
                        "description": "Giving a quick office walkthrough.",
                        "situation": "Walking around the office workspace.",
                        "role_a_name": "Mentor", "role_b_name": "New Hire",
                        "level": Level.INTERMEDIATE, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "This is our open workspace, and the breakroom is right down the hall.", "Point out landmarks cleanly."),
                            ("B", "It looks really modern and bright! Where is the main conference room?", "Express positive impression and ask question."),
                            ("A", "It's on the left, next to the glass doors. That's where we hold weekly syncs.", "Provide directions and context."),
                            ("B", "Got it. Thank you for showing me around, I feel very welcomed.", "Express warm gratitude.")
                        ]
                    },
                    {
                        "title": "Asking for Technical Help",
                        "description": "Asking a colleague to look at a spreadsheet formula.",
                        "situation": "Leaning over a colleague's desk.",
                        "role_a_name": "Learner", "role_b_name": "Helper",
                        "level": Level.INTERMEDIATE, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, Mark. Do you have five minutes? I'm struggling with this Excel formula.", "Politely request short time slot."),
                            ("A", "Sure, let's take a look. What seems to be the problem?", "Accept help request readily."),
                            ("B", "I'm trying to sum these cells, but it keeps returning an error message.", "Describe technical problem clearly."),
                            ("A", "Ah, I see. You missed a comma right here. Let me fix it for you.", "Diagnose and fix issue helpfully.")
                        ]
                    },
                    {
                        "title": "Project Progress Update",
                        "description": "Reporting weekly project milestones.",
                        "situation": "During a team sync meeting.",
                        "role_a_name": "Project Lead", "role_b_name": "Team Member",
                        "level": Level.INTERMEDIATE, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Let's hear updates on the website redesign. How are we doing, Sarah?", "Call for status updates professionally."),
                            ("B", "The design prototype is completed, and we are starting developer handoff today.", "Report positive milestones directly."),
                            ("A", "That's fantastic progress! Are there any roadblocks we need to resolve?", "Praise work and check for bottlenecks."),
                            ("B", "No major issues, we are fully on track to launch next Friday.", "Confirm good status confidently.")
                        ]
                    },
                    {
                        "title": "Requesting a Vacation Day",
                        "description": "Asking manager for scheduled time off.",
                        "situation": "Private meeting in the manager's office.",
                        "role_a_name": "Manager", "role_b_name": "Employee",
                        "level": Level.INTERMEDIATE, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("B", "Hi Boss, I wanted to ask if I could take next Friday off for a family event?", "Ask for time off politely with justification."),
                            ("A", "Let me check our calendar... Yes, that should be fine. Have you updated your team?", "Check calendar and check team alignment."),
                            ("B", "Yes, I've asked John to cover my urgent emails for that day.", "Confirm coverage backup proactively."),
                            ("A", "Perfect, please submit the request in the system and enjoy your weekend.", "Approve and instruct system step.")
                        ]
                    },
                    {
                        "title": "Giving Positive Feedback",
                        "description": "Congratulating a teammate after a big presentation.",
                        "situation": "In the hallway after a client meeting.",
                        "role_a_name": "Colleague A", "role_b_name": "Colleague B",
                        "level": Level.INTERMEDIATE, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "You did an absolute amazing job with that presentation today! The client loved it.", "Offer sincere and high praise."),
                            ("B", "Thank you so much! I was really nervous before we started.", "Acknowledge praise and admit vulnerability naturally."),
                            ("A", "You couldn't tell at all. Your explanations were extremely clear and professional.", "Reassure them with specific highlights."),
                            ("B", "I really appreciate your support. It makes the hard work worth it!", "Express deep professional gratitude.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Travel & Accommodations",
                    "description": "Book taxis, check flights, request concierge tips, and ask about hotel amenities.",
                    "icon": "🏨",
                    "level": Level.INTERMEDIATE,
                    "sort_order": 11,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Calling a Cozy Hotel",
                        "description": "Checking room availability by phone.",
                        "situation": "Inquiring about weekend rooms.",
                        "role_a_name": "Clerk", "role_b_name": "Traveler",
                        "level": Level.INTERMEDIATE, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Ocean View Lodge. How may I assist you today?", "Professional hotel greeting."),
                            ("B", "Hi, do you have any double rooms available for this coming weekend?", "Ask about specific room availability."),
                            ("A", "Yes, we have a few ocean-facing double rooms left. The rate is $150 per night.", "State availability and price clearly."),
                            ("B", "That's perfect. Does that price include breakfast in the morning?", "Inquire about package inclusions.")
                        ]
                    },
                    {
                        "title": "Ordering a Taxi Ride",
                        "description": "Booking a taxi to the airport over the phone.",
                        "situation": "Calling a local cab company dispatcher.",
                        "role_a_name": "Dispatcher", "role_b_name": "Passenger",
                        "level": Level.INTERMEDIATE, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "City Cabs. What is your pickup address today?", "Prompt pickup query directly."),
                            ("B", "Hi, I need a taxi from 456 Oak Street to the international airport, please.", "Provide addresses clearly."),
                            ("A", "Sure, I have a driver nearby. They should arrive in seven minutes. Look for a yellow car.", "State arrival estimate and car identifiers."),
                            ("B", "Great, I'll wait outside the building. Thank you!", "Confirm waiting spot and close.")
                        ]
                    },
                    {
                        "title": "Checking Flight Status",
                        "description": "Asking about flight delays at the gate.",
                        "situation": "At the airport departure gate desk.",
                        "role_a_name": "Gate Agent", "role_b_name": "Passenger",
                        "level": Level.INTERMEDIATE, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, is flight BA204 to Paris still scheduled to depart on time?", "Inquire about schedule status."),
                            ("A", "Let me scan your boarding pass... It looks like departure is delayed by forty minutes due to weather.", "Scan pass and explain delay reason."),
                            ("B", "Oh, okay. Will I miss my connecting flight in Paris then?", "Raise logical concerns about connections."),
                            ("A", "No, your connection is in three hours, so you will have plenty of time.", "Reassure customer with data.")
                        ]
                    },
                    {
                        "title": "Local Spots Advice",
                        "description": "Asking the hotel concierge for dinner recommendations.",
                        "situation": "At the lobby concierge desk.",
                        "role_a_name": "Concierge", "role_b_name": "Guest",
                        "level": Level.INTERMEDIATE, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("B", "Hi, can you recommend a good local seafood restaurant nearby that isn't too touristy?", "Ask for specialized dining recommendation."),
                            ("A", "Definitely! You should check out Captain's Table. It's only a five-minute walk and highly popular with locals.", "Provide name, travel time, and positive review."),
                            ("B", "That sounds perfect. Do we need to book a table in advance?", "Ask about reservation necessity."),
                            ("A", "It's usually busy, so I can call them and make a reservation for you right now.", "Offer proactive and helpful service.")
                        ]
                    },
                    {
                        "title": "Asking about Gym Amenities",
                        "description": "Checking hotel facilities.",
                        "situation": "At the hotel front desk.",
                        "role_a_name": "Front Desk", "role_b_name": "Guest",
                        "level": Level.INTERMEDIATE, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("B", "Hi, does this hotel have a gym or swimming pool that guests can use?", "Ask about specific facilities."),
                            ("A", "Yes, we have both on the rooftop. They are free for guests and open from six AM to ten PM.", "Provide facility location and opening hours."),
                            ("B", "Wonderful! Do I need a special keycard to access them?", "Ask access requirements."),
                            ("A", "No, your standard room keycard will work on the rooftop door.", "Clarify keycard usage clearly.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Hobbies & Interests",
                    "description": "Talk about your favorite books, learning instruments, working out, video games, and photography.",
                    "icon": "🎸",
                    "level": Level.INTERMEDIATE,
                    "sort_order": 12,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Discussing a Good Novel",
                        "description": "Sharing thoughts on a recently read book.",
                        "situation": "Sitting in a library lounge.",
                        "role_a_name": "Nora", "role_b_name": "Sam",
                        "level": Level.INTERMEDIATE, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Have you read anything interesting lately? I need book recommendations.", "Ask for reading suggestions."),
                            ("B", "Yes! I just finished a mystery novel called The Silent Night. It was gripping.", "Share book title and enthusiastic review."),
                            ("A", "Oh, I love mysteries! No spoilers, but was the ending satisfying?", "Express interest and ask about conclusion."),
                            ("B", "Absolutely. I didn't see the twist coming at all. You should borrow it!", "Confirm positive quality and offer book lend.")
                        ]
                    },
                    {
                        "title": "Learning the Acoustic Guitar",
                        "description": "Talking about taking music lessons.",
                        "situation": "Walking home from school or work.",
                        "role_a_name": "Musician", "role_b_name": "Learner",
                        "level": Level.INTERMEDIATE, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "I saw you carrying a guitar case yesterday. Are you taking lessons?", "Observe and ask about hobby."),
                            ("B", "Yes, I started learning acoustic guitar last month. It's quite hard for my fingers!", "Share learning duration and physical challenge."),
                            ("A", "Oh, the finger pain goes away in two weeks! Keep practicing every day.", "Reassure and offer motivational practice advice."),
                            ("B", "Thanks, I can already play three simple songs, which feels amazing!", "Share positive progress proudly.")
                        ]
                    },
                    {
                        "title": "My Weekly Gym Routine",
                        "description": "Discussing fitness habits with a friend.",
                        "situation": "Having juices after a workout.",
                        "role_a_name": "Gym Regular", "role_b_name": "Casual Trainer",
                        "level": Level.INTERMEDIATE, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "How often do you work out? You look very fit lately.", "Ask routine frequency and compliment."),
                            ("B", "I go to the gym three times a week for weight training and cardio. How about you?", "State gym schedule details and return question."),
                            ("A", "I prefer outdoor jogging. I try to run five kilometers every morning.", "Contrast gym with outdoor cardio routine."),
                            ("B", "Wow, that takes a lot of discipline! I hate running in the cold.", "Praise discipline and share personal dislike.")
                        ]
                    },
                    {
                        "title": "Talking about a Video Game",
                        "description": "Discussing a popular multiplayer game.",
                        "situation": "Chatting online in Discord.",
                        "role_a_name": "Gamer A", "role_b_name": "Gamer B",
                        "level": Level.INTERMEDIATE, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Hey, did you download the new updates for Apex Legends yesterday?", "Inquire about game updates."),
                            ("B", "Yes, the new character is super fun to play, but the servers are laggy.", "Give quick character review and server complaint."),
                            ("A", "I know, I got disconnected twice during competitive matches.", "Empathize with connection issue example."),
                            ("B", "Let's team up tonight once the servers are stabilized!", "Suggest playing together later.")
                        ]
                    },
                    {
                        "title": "Photography Tips share",
                        "description": "Sharing simple camera settings.",
                        "situation": "Taking pictures in a botanical garden.",
                        "role_a_name": "Photographer", "role_b_name": "Beginner",
                        "level": Level.INTERMEDIATE, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("B", "Your photos always look so sharp. What is your secret?", "Compliment quality and ask for advice."),
                            ("A", "I always shoot in manual mode and adjust the aperture to get a blurry background.", "Provide technical setting tip clearly."),
                            ("B", "Ah, is that how you make the flowers stand out so beautifully?", "Translate tip to visual outcome logic."),
                            ("A", "Exactly. Let me show you how to change the settings on your camera.", "Offer hands-on configuration help.")
                        ]
                    }
                ]
            },

            # ==========================================
            # LEVEL 3: ADVANCED (30 Conversations, Topics 13-18)
            # ==========================================
            {
                "topic": {
                    "title": "Workplace Collaboration",
                    "description": "Handle high-stakes professional situations: launching features, budget allocations, mistakes, and team resources.",
                    "icon": "🤝",
                    "level": Level.ADVANCED,
                    "sort_order": 13,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Launch Date Compromise",
                        "description": "Resolving launch date conflicts professionally.",
                        "situation": "A tense project management meeting.",
                        "role_a_name": "Manager", "role_b_name": "Designer",
                        "level": Level.ADVANCED, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "We absolutely must launch this feature next Monday to hit our quarterly target.", "Express firm, corporate urgency."),
                            ("B", "With all due respect, the prototype still has critical usability issues that could harm our brand.", "Politely disagree with professional justification."),
                            ("A", "Can we release it as a beta and patch those issues in the next sprint?", "Propose realistic compromise suggestion."),
                            ("B", "A beta release is viable, provided we secure three days of quality assurance testing first.", "Accept compromise conditionally with focus on quality."),
                            ("A", "That's a fair point. Let's adjust the schedule by three days to ensure basic stability.", "Agree and direct final action plan.")
                        ]
                    },
                    {
                        "title": "Marketing Budget Allocation",
                        "description": "Debating where to spend marketing capital.",
                        "situation": "A finance planning session.",
                        "role_a_name": "Product Lead", "role_b_name": "Marketing Director",
                        "level": Level.ADVANCED, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "I propose allocating sixty percent of our budget to search engine optimization and social media ads.", "Present structured budget proposal clearly."),
                            ("B", "I disagree. Our data shows influencer partnerships yield a significantly higher conversion rate for this demographic.", "Provide counter-argument based on solid data trends."),
                            ("A", "While that's true, influencer marketing doesn't build long-term organic traffic like SEO does.", "Defend proposal with strategic reasoning."),
                            ("B", "Let's run a small split-test with both strategies next month to see which performs better.", "Propose empirical test to resolve debate cleanly.")
                        ]
                    },
                    {
                        "title": "Handling a Critical Software Bug",
                        "description": "Reacting to an emergency server issue.",
                        "situation": "An emergency Slack call.",
                        "role_a_name": "CTO", "role_b_name": "Lead Engineer",
                        "level": Level.ADVANCED, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "The production server is throwing database timeout errors. Do we know the root cause?", "Urgent problem query from leadership."),
                            ("B", "Yes, the latest release introduced an unindexed query that is bottlenecking the database connections.", "Provide concise, accurate technical diagnosis."),
                            ("A", "Understood. Should we rollback the release immediately or can we push a quick hotfix?", "Ask for critical action plan recommendation."),
                            ("B", "I'm already drafting a database migration index. We can deploy the hotfix within fifteen minutes safely.", "Report active mitigation progress confidently.")
                        ]
                    },
                    {
                        "title": "Pitching a New Feature Design",
                        "description": "Convincing the team to adopt a user-friendly update.",
                        "situation": "Standing in front of a white board.",
                        "role_a_name": "Presenter", "role_b_name": "Skeptic",
                        "level": Level.ADVANCED, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "By simplifying the checkout flow to a single page, we can reduce cart abandonment by twenty percent.", "Pitch feature with clear value proposition metrics."),
                            ("B", "But a single-page checkout might complicate our payment integration architecture. Is it worth the risk?", "Challenge proposal with technical complexity concerns."),
                            ("A", "The developer team confirmed the API supports this architecture. The risk is minimal compared to the potential revenue gain.", "Refute concern with solid developer alignment data."),
                            ("B", "Fair enough. Let's mock up a high-fidelity prototype and run a quick usability study.", "Agree to proceed with testing checkpoint.")
                        ]
                    },
                    {
                        "title": "Asking for More Team Resources",
                        "description": "Negotiating headcount with department head.",
                        "situation": "One-on-one manager sync.",
                        "role_a_name": "Department Head", "role_b_name": "Team Lead",
                        "level": Level.ADVANCED, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "Your team's velocity has slowed down slightly this quarter. What seems to be the issue?", "Query performance metrics objectively."),
                            ("B", "Honestly, we are severely bottlenecked by the lack of back-end developers. We need at least one more engineer to hit next milestones.", "State resource bottleneck directly and ask headcount."),
                            ("A", "We are under a strict hiring freeze right now. Can we borrow an engineer from the mobile team instead?", "Explain constraints and suggest internal resource transfer."),
                            ("B", "That would be a huge help! Having their engineer part-time would allow us to unblock the critical backend pipeline.", "Express enthusiasm and accept internal transfer solution.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Job Interviews & Career",
                    "description": "Ace professional conversations: walkthrough resumes, pitch strengths, negotiate salary, and seek career mentorship.",
                    "icon": "🚀",
                    "level": Level.ADVANCED,
                    "sort_order": 14,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Walk Me Through Your Resume",
                        "description": "Acing the introductory interview question.",
                        "situation": "A formal recruitment interview.",
                        "role_a_name": "Recruiter", "role_b_name": "Candidate",
                        "level": Level.ADVANCED, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Welcome, Leo. To begin, could you walk us through your career history and key highlights?", "Standard open-ended interview question."),
                            ("B", "Certainly. For the past four years, I've led full-stack engineering teams, specializing in scaling high-traffic web platforms.", "Deliver strong, concise elevator pitch of career."),
                            ("A", "What was the most impactful project you spearheaded in your previous position?", "Ask for specific, measurable accomplishment highlights."),
                            ("B", "I migrated our legacy servers to AWS, which improved system uptime to ninety-nine point nine percent and cut costs by thirty percent.", "Answer with concrete metrics and clear achievements.")
                        ]
                    },
                    {
                        "title": "Highlighting Your Core Strengths",
                        "description": "Presenting personal value proposition.",
                        "situation": "Answering behavioral questions.",
                        "role_a_name": "Interviewer", "role_b_name": "Candidate",
                        "level": Level.ADVANCED, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Why should we hire you over the other highly qualified candidates we are interviewing?", "Ask high-stakes comparison question."),
                            ("B", "My core strength lies in bridging technical complexity with business strategy, ensuring we don't just build fast, but build the right features.", "Explain unique value proposition clearly."),
                            ("A", "That's a valuable trait. How do you communicate technical constraints to non-technical stakeholders?", "Probe behavioral communication skills further."),
                            ("B", "I avoid jargon completely, using analogies and focusing on how constraints affect the project timeline and bottom line.", "Answer with practical, logical explanation.")
                        ]
                    },
                    {
                        "title": "Discussing Areas of Growth",
                        "description": "Answering the weakness question constructively.",
                        "situation": "During the middle part of the interview.",
                        "role_a_name": "Interviewer", "role_b_name": "Candidate",
                        "level": Level.ADVANCED, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "What do you consider to be your greatest professional weakness or area of growth?", "Ask classic behavioral growth question."),
                            ("B", "Lately, I've realized I tend to take on too much responsibility to ensure perfection, rather than delegating tasks.", "State real weakness constructively."),
                            ("A", "How are you actively working to overcome this challenge in your current role?", "Follow up on self-improvement actions."),
                            ("B", "I've started setting strict boundaries, using project management tools to trust teammates, and delegating higher-level tasks.", "Explain concrete actions taken to grow.")
                        ]
                    },
                    {
                        "title": "Negotiating Salary and Package",
                        "description": "Discussing compensation options professionally.",
                        "situation": "An HR phone call after receiving an offer.",
                        "role_a_name": "HR Specialist", "role_b_name": "Candidate",
                        "level": Level.ADVANCED, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "We are thrilled to offer you the position at a base salary of ninety-five thousand dollars.", "Deliver official base salary offer."),
                            ("B", "Thank you! I'm very excited about the role. Given my experience, I was hoping we could get closer to one hundred and ten thousand.", "Acknowledge offer and counter-propose confidently with justification."),
                            ("A", "Our maximum budget for this band is one hundred thousand. Can we compromise there, plus an extra week of vacation?", "Offer counter-compromise with base salary cap and benefits."),
                            ("B", "One hundred thousand base with the extra week of vacation sounds like a fair and generous package. I accept!", "Accept compromise enthusiastically and lock in contract.")
                        ]
                    },
                    {
                        "title": "Seeking Career Mentorship",
                        "description": "Asking a senior leader for career guidance.",
                        "situation": "Coffee chat with a senior director.",
                        "role_a_name": "Senior Director", "role_b_name": "Junior Employee",
                        "level": Level.ADVANCED, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "I'm always happy to help. What specific career questions did you want to discuss today?", "Open mentorship session warmly."),
                            ("B", "I want to transition from engineering to product management in the future. What skills should I focus on building now?", "State clear career goals and ask targeted skills advice."),
                            ("A", "You should shadow product managers during specification reviews, and focus heavily on user research and metrics data.", "Provide solid, actionable advice based on experience."),
                            ("B", "That makes sense. Would you mind if I shadowed one of your project launches next month?", "Ask for practical, hands-on learning opportunity politely.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Crisis & Emergencies",
                    "description": "Learn to report fires, thefts, medical emergencies, road breakdowns, and prepare for disasters.",
                    "icon": "🚨",
                    "level": Level.ADVANCED,
                    "sort_order": 15,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Calling the Fire Department",
                        "description": "Reporting a kitchen fire emergency.",
                        "situation": "Calling emergency services 911.",
                        "role_a_name": "Operator", "role_b_name": "Caller",
                        "level": Level.ADVANCED, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Emergency Services. What is the address and nature of your emergency?", "Urgent, calm dispatcher voice."),
                            ("B", "There is a severe grease fire in the kitchen of my apartment at 123 Pine Street, third floor!", "Provide nature of fire and precise address clearly."),
                            ("A", "Is everyone out of the building? Do not attempt to extinguish a grease fire with water.", "Check safety status and issue critical instructions."),
                            ("B", "Yes, we are exiting now. The smoke alarm is ringing loudly.", "Confirm evacuation and status."),
                            ("A", "Excellent. Fire engines are dispatched and on their way. Stay safe outside.", "Provide dispatch status and reassurance.")
                        ]
                    },
                    {
                        "title": "Reporting a Wallet Theft",
                        "description": "Filing a police report for stolen items.",
                        "situation": "At the local police precinct desk.",
                        "role_a_name": "Officer", "role_b_name": "Victim",
                        "level": Level.ADVANCED, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "How can I assist you today, sir?", "Professional police officer greeting."),
                            ("B", "My wallet was stolen from my backpack while I was riding the crowded subway ten minutes ago.", "Explain theft context, timeline, and location directly."),
                            ("A", "Did you notice anyone suspicious nearby? What did your wallet contain?", "Inquire details about suspects and contents."),
                            ("B", "It was a black leather wallet containing my driver's license, credit cards, and about fifty dollars cash.", "Describe stolen items clearly and precisely.")
                        ]
                    },
                    {
                        "title": "Requesting an Ambulance",
                        "description": "Reporting a medical emergency on the sidewalk.",
                        "situation": "Calling dispatch after a pedestrian collapses.",
                        "role_a_name": "911 Dispatcher", "role_b_name": "Bystander",
                        "level": Level.ADVANCED, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Emergency Medical. Is the patient conscious and breathing?", "Calm, clinical diagnostic emergency question."),
                            ("B", "He collapsed suddenly. He is unconscious but he is still breathing shallowly. We are near the park entrance.", "Describe patient state and exact location clearly."),
                            ("A", "Keep him lying flat and do not move him. An ambulance is on the way with sirens.", "Give medical guidance and confirm dispatch."),
                            ("B", "Thank you, I will stay with him until the paramedics arrive.", "Confirm cooperation and support.")
                        ]
                    },
                    {
                        "title": "Highway Car Breakdown",
                        "description": "Calling a towing service on a busy highway.",
                        "situation": "Calling roadside assistance on your phone.",
                        "role_a_name": "Roadside Agent", "role_b_name": "Driver",
                        "level": Level.ADVANCED, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Roadside Assistance. Do you know your highway exit number or mile marker?", "Check location coordinates directly."),
                            ("B", "I'm on Interstate ninety-five, northbound, about two miles past exit twelve. My engine is smoking.", "Describe exact highway location and vehicle symptoms."),
                            ("A", "Please stay inside the vehicle with your hazard lights blinking. I am dispatching a tow truck.", "Instruct safety protocol and dispatch truck."),
                            ("B", "Alright, I've got my hazards on. How long before the tow truck arrives?", "Confirm safety action and ask ETA.")
                        ]
                    },
                    {
                        "title": "Discussing Storm Preparations",
                        "description": "Coordinating hurricane safety steps with family.",
                        "situation": "Talking in the living room before a major storm.",
                        "role_a_name": "Parent A", "role_b_name": "Parent B",
                        "level": Level.ADVANCED, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "The weather advisory says the hurricane will make landfall tomorrow. Do we have enough supplies?", "Raise emergency preparation concerns."),
                            ("B", "I bought bottled water, canned food, and extra batteries this morning. The flashlights are ready.", "List stocked supplies systematically."),
                            ("A", "Should we board up the large windows in the living room?", "Suggest specific physical safety measures."),
                            ("B", "Yes, let's nail the plywood boards over them before it gets dark and the wind picks up.", "Agree and schedule physical task.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Travel Struggles",
                    "description": "Handle complicated travel mishaps: overbooked flights, missed connections, car rental disputes, and hotel room issues.",
                    "icon": "✈️",
                    "level": Level.ADVANCED,
                    "sort_order": 16,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Negotiating an Overbooked Flight",
                        "description": "Handling bumping at the departure gate.",
                        "situation": "At the airline boarding desk.",
                        "role_a_name": "Agent", "role_b_name": "Passenger",
                        "level": Level.ADVANCED, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "Unfortunately, Mr. Davis, this flight is overbooked, and we cannot guarantee you a seat.", "Deliver bad news professionally."),
                            ("B", "That is unacceptable. I booked my ticket three months ago and have an urgent business meeting tomorrow.", "Express strong dissatisfaction and cite urgency."),
                            ("A", "If you volunteer to take the next flight, we can offer you a five hundred dollar travel voucher.", "Offer standard voucher incentive to volunteer."),
                            ("B", "I can accept that only if you also upgrade my seat to first class on the next flight.", "Counter-negotiate for high-value upgrades confidently."),
                            ("A", "Let me check availability... Okay, I can confirm first class on the five PM flight. Here is your voucher.", "Check system, agree to terms, and provide voucher.")
                        ]
                    },
                    {
                        "title": "Missed Connecting Flight",
                        "description": "Rebooking flights at the transfer desk.",
                        "situation": "Running to the airline customer service counter.",
                        "role_a_name": "Desk Agent", "role_b_name": "Distressed Passenger",
                        "level": Level.ADVANCED, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("B", "My incoming flight was delayed, and I just missed my connecting flight to Tokyo. What are my options?", "Explain missed connection and request immediate options."),
                            ("A", "I'm so sorry. Let me find the next available flight... We can put you on a flight tomorrow morning.", "Empathize and offer next day rebooking."),
                            ("B", "Tomorrow morning? That means I need to stay overnight. Will the airline cover my hotel cost?", "Highlight overnight stay consequence and ask hotel voucher."),
                            ("A", "Yes, since the delay was our fault, we will provide a complimentary hotel stay and meal vouchers.", "Accept responsibility and offer hotel/meal benefits readily.")
                        ]
                    },
                    {
                        "title": "Rental Car Bill Dispute",
                        "description": "Addressing incorrect charges on a final bill.",
                        "situation": "At the car rental return counter.",
                        "role_a_name": "Counter Clerk", "role_b_name": "Customer",
                        "level": Level.ADVANCED, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("B", "Hi, I noticed a one hundred dollar cleaning fee on my final bill. Why was I charged this?", "Query incorrect bill charge politely but firmly."),
                            ("A", "Our inspector reported that the passenger seat was excessively dirty when you returned the vehicle.", "Explain charge justification based on report details."),
                            ("B", "That's impossible. I took photos of the interior right before returning it, and it was spotless.", "Refute claim with empirical proof evidence."),
                            ("A", "Ah, let me look at your photos... Okay, my apologies. That was clearly an error. I'll remove the charge immediately.", "Review evidence, apologize, and remove charge.")
                        ]
                    },
                    {
                        "title": "Dealing with a Broken Hotel AC",
                        "description": "Requesting a room change due to faulty appliances.",
                        "situation": "Calling hotel reception from the room phone.",
                        "role_a_name": "Receptionist", "role_b_name": "Guest",
                        "level": Level.ADVANCED, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("B", "Hi, the air conditioning in room 405 is not blowing cold air. It's incredibly hot in here.", "Report broken appliance and explain discomfort direct."),
                            ("A", "I'm very sorry. I can send a maintenance engineer up immediately to inspect it.", "Offer standard maintenance response politely."),
                            ("B", "It's already midnight, and I'm exhausted. I'd rather just change to a working room if possible.", "Refuse late maintenance and request room transfer instead."),
                            ("A", "I completely understand. I have an identical room ready on the fifth floor. I'll bring the new keys up right now.", "Show empathy and deliver prompt room transfer.")
                        ]
                    },
                    {
                        "title": "Reporting a Damaged Suitcase",
                        "description": "Reporting broken luggage bags.",
                        "situation": "At the airline baggage services desk.",
                        "role_a_name": "Baggage Agent", "role_b_name": "Passenger",
                        "level": Level.ADVANCED, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("B", "Excuse me, I just retrieved my suitcase, and the wheel has been completely broken off.", "Report damaged luggage directly and show issue."),
                            ("A", "Oh, that is severe damage. Let me file a property irregularity report for you.", "Acknowledge damage and initiate official report."),
                            ("B", "Will the airline pay for the repair or replace the suitcase?", "Ask about compensation terms clearly."),
                            ("A", "Yes, we will cover the repair cost or replace it if it's unfixable. Please fill out this claim form.", "Confirm coverage and guide claim process.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Deep Discussions",
                    "description": "Engage in intellectual topics: the future of AI, remote work benefits, healthy living, and environmental protection.",
                    "icon": "🗣️",
                    "level": Level.ADVANCED,
                    "sort_order": 17,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "AI and the Future of Work",
                        "description": "Discussing the job impact of artificial intelligence.",
                        "situation": "Having lunch with a coworker.",
                        "role_a_name": "Optimist", "role_b_name": "Skeptic",
                        "level": Level.ADVANCED, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("A", "I believe AI will automate boring tasks, freeing humans to focus on highly creative work.", "Express positive, progressive outlook on AI."),
                            ("B", "That's easy to say, but massive automation could lead to structural unemployment for millions of office workers.", "Highlight negative, realistic socio-economic risks."),
                            ("A", "History shows that technological revolutions always create more jobs than they destroy in the long run.", "Rebut with historical technology trends argument."),
                            ("B", "Yes, but the transition period can be extremely painful. We need proactive government retraining programs.", "Concede partially, and suggest structural policy solutions.")
                        ]
                    },
                    {
                        "title": "Remote vs. Office Work",
                        "description": "Debating flexible working models.",
                        "situation": "A coffee shop debate.",
                        "role_a_name": "Remote Advocate", "role_b_name": "Office Supporter",
                        "level": Level.ADVANCED, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("A", "Remote work eliminates stressful commutes, saving money and boosting employee productivity.", "Argue benefits of remote work directly."),
                            ("B", "However, virtual communication can't replicate the spontaneous collaboration and team bonding of a shared office.", "Argue benefits of face-to-face team synergy."),
                            ("A", "We can easily build that synergy with structured virtual coffee chats and quarterly in-person retreats.", "Propose remote-first alternative solutions."),
                            ("B", "Perhaps, but a hybrid model seems to be the most balanced solution for both parties.", "Propose balanced hybrid middle ground compromise.")
                        ]
                    },
                    {
                        "title": "Healthy Living: Clean Eating",
                        "description": "Discussing dietary habits and fast food impact.",
                        "situation": "Looking at grocery items in a shopping cart.",
                        "role_a_name": "Nutritionist", "role_b_name": "Average Consumer",
                        "level": Level.ADVANCED, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Replacing processed foods with organic vegetables can drastically lower chronic disease risks.", "Present health facts on clean eating professionally."),
                            ("B", "I know, but fresh organic produce is so much more expensive and takes hours to prepare.", "Highlight cost and time constraints practically."),
                            ("A", "Meal prepping on Sundays can save both time and money during the busy workweek.", "Offer practical, actionable meal-planning advice."),
                            ("B", "That's a smart strategy. I should try prepping simple chicken and veggie bowls this weekend.", "Adopt strategy and set personal goal.")
                        ]
                    },
                    {
                        "title": "Environmental Action: Plastic",
                        "description": "Debating how to reduce plastic waste in everyday life.",
                        "situation": "Walking along a polluted beach.",
                        "role_a_name": "Environmentalist", "role_b_name": "Pragmatist",
                        "level": Level.ADVANCED, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Seeing all this plastic waste is devastating. We must ban all single-use plastics immediately.", "Express strong concern and call for drastic policy bans."),
                            ("B", "A complete ban is unrealistic because industries rely heavily on plastic for safe and sterile packaging.", "Highlight industrial reliance and necessity constraints."),
                            ("A", "Then we must heavily tax plastic production to force companies to invest in biodegradable packaging.", "Suggest economic taxation to drive eco-innovation."),
                            ("B", "That's a fair economic compromise. Consumer pressure can also accelerate that transition.", "Agree with tax compromise and add consumer power factor.")
                        ]
                    },
                    {
                        "title": "Lifelong Learning in Adulthood",
                        "description": "Discussing learning new skills as working adults.",
                        "situation": "Drinking tea on a weekend evening.",
                        "role_a_name": "Lifelong Learner", "role_b_name": "Busy Worker",
                        "level": Level.ADVANCED, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "I've started taking online coding courses in the evening. It's so exciting to learn new skills!", "Share personal learning hobby enthusiastically."),
                            ("B", "I admire your energy. After a long workday, I'm simply too exhausted to concentrate on study.", "Express admiration coupled with realistic daily fatigue."),
                            ("A", "Even studying for fifteen minutes a day can yield substantial progress over a single year.", "Suggest low-barrier, high-consistency study advice."),
                            ("B", "Fifteen minutes seems manageable. Maybe I can study language apps during my daily train commute.", "Adopt advice and integrate into transit schedule.")
                        ]
                    }
                ]
            },
            {
                "topic": {
                    "title": "Client & Customer Support",
                    "description": "Manage corporate relations: handling angry complaints, explaining refunds, and scheduling demos.",
                    "icon": "📞",
                    "level": Level.ADVANCED,
                    "sort_order": 18,
                    "is_published": True
                },
                "conversations": [
                    {
                        "title": "Handling an Angry Client Complaint",
                        "description": "De-escalating a delivery delay issue.",
                        "situation": "A tense phone call with an enterprise customer.",
                        "role_a_name": "Support Lead", "role_b_name": "Angry Client",
                        "level": Level.ADVANCED, "sort_order": 1, "is_published": True,
                        "lines": [
                            ("B", "Our shipment is three days late, and our operations are completely frozen! This is unacceptable!", "Express extreme frustration directly."),
                            ("A", "I understand your frustration completely, and I apologize sincerely for this severe delay.", "Validate client frustration immediately and offer sincere apology."),
                            ("B", "Apologies don't solve our production stoppage. What are you doing to fix this immediately?", "Reject standard apologies and demand active mitigation solutions."),
                            ("A", "I have upgraded your delivery to emergency courier shipping. It will arrive at your warehouse by three PM today.", "Deliver concrete, high-cost mitigation solution confidently."),
                            ("B", "Three PM today works. Please email me the tracking link immediately.", "Calm down, accept solution, and request verification details.")
                        ]
                    },
                    {
                        "title": "Explaining the Refund Policy",
                        "description": "Walking a customer through the return terms.",
                        "situation": "A live chat support conversation.",
                        "role_a_name": "Support Agent", "role_b_name": "Customer",
                        "level": Level.ADVANCED, "sort_order": 2, "is_published": True,
                        "lines": [
                            ("B", "Hi, I'd like to return this electronic device, but I opened the box. Can I still get a full refund?", "Inquire about open-box refund policy eligibility."),
                            ("A", "Yes, you can receive a full refund as long as the return is processed within thirty days of purchase.", "Confirm refund eligibility clearly with time parameters."),
                            ("B", "Great! Who pays for the return shipping costs?", "Ask about secondary transaction costs (shipping)."),
                            ("A", "We will provide a free prepaid shipping label. Just print it and drop the package at any post office.", "Provide convenient, cost-free shipping solutions clearly.")
                        ]
                    },
                    {
                        "title": "Custom Service Plan Pitch",
                        "description": "Upselling a premium enterprise tier.",
                        "situation": "A scheduled account review call.",
                        "role_a_name": "Account Manager", "role_b_name": "Client",
                        "level": Level.ADVANCED, "sort_order": 3, "is_published": True,
                        "lines": [
                            ("A", "Given your increasing transaction volume, our custom enterprise plan would reduce your transaction fees by fifty percent.", "Pitch customized service plan based on client metrics data."),
                            ("B", "That's a significant fee reduction. What is the annual contract commitment cost?", "Acknowledge value and ask about financial commitments."),
                            ("A", "It requires a twelve-month commitment, but it includes a dedicated account manager and twenty-four-seven phone support.", "State commitment terms and bundle premium support features."),
                            ("B", "Please send over the draft proposal. I'll review it with our finance director this week.", "Request official documentation for internal reviews.")
                        ]
                    },
                    {
                        "title": "Scheduling a Product Demo",
                        "description": "Coordinating a B2B platform walkthrough.",
                        "situation": "Following up with an interested sales lead by phone.",
                        "role_a_name": "Sales Rep", "role_b_name": "Prospect",
                        "level": Level.ADVANCED, "sort_order": 4, "is_published": True,
                        "lines": [
                            ("A", "Hi Sarah, thanks for your interest in our platform. I'd love to schedule a fifteen-minute screen-share demo.", "Express appreciation and propose short demo meeting."),
                            ("B", "Hi, that would be helpful. I'm free next Wednesday morning or Thursday afternoon.", "Agree and present available booking ranges."),
                            ("A", "How about next Wednesday at ten AM? I can walk you through our analytics dashboard.", "Suggest specific slot and state value-added agenda."),
                            ("B", "Wednesday at ten AM works perfectly. Send over the calendar invite and video link.", "Confirm slot and request booking invitations.")
                        ]
                    },
                    {
                        "title": "Gathering Customer Feedback",
                        "description": "Interviewing a loyal user about new updates.",
                        "situation": "A post-update feedback interview.",
                        "role_a_name": "Product Researcher", "role_b_name": "User",
                        "level": Level.ADVANCED, "sort_order": 5, "is_published": True,
                        "lines": [
                            ("A", "How has your experience been with our new mobile dashboard layout?", "Ask targeted customer feedback question."),
                            ("B", "The loading speed is much faster, but the navigation menu feels less intuitive than before.", "Praise performance but offer constructive usability critiques."),
                            ("A", "Interesting. What specific parts of the menu are causing confusion?", "Probe further to identify precise friction points."),
                            ("B", "Finding the settings page takes three clicks now instead of one. It should be on the home screen.", "Describe specific friction point and suggest direct solution.")
                        ]
                    }
                ]
            }
        ]

        # Idempotent upsert by the curriculum's stable topic/conversation titles.
        print("Upserting topics, conversations, and lines...")
        for topic_index, topic_data in enumerate(curriculum):
            topic_values = topic_data["topic"]
            topic = (
                await session.execute(
                    select(Topic)
                    .where(Topic.title == topic_values["title"])
                    .order_by(Topic.created_at)
                )
            ).scalars().first()
            if topic is None:
                topic = Topic(title=topic_values["title"])
                session.add(topic)
            topic.description = topic_values["description"]
            topic.icon = topic_values["icon"]
            topic.level = topic_values["level"]
            topic.sort_order = topic_index + 1
            topic.is_published = topic_values["is_published"]
            await session.flush()

            for conv_index, conv_data in enumerate(topic_data["conversations"]):
                conversation = (
                    await session.execute(
                        select(Conversation)
                        .where(
                            Conversation.topic_id == topic.id,
                            Conversation.title == conv_data["title"],
                        )
                        .order_by(Conversation.created_at)
                    )
                ).scalars().first()
                if conversation is None:
                    conversation = Conversation(
                        topic_id=topic.id,
                        title=conv_data["title"],
                    )
                    session.add(conversation)
                conversation.description = conv_data["description"]
                conversation.situation = conv_data["situation"]
                conversation.role_a_name = conv_data["role_a_name"]
                conversation.role_b_name = conv_data["role_b_name"]
                conversation.level = conv_data["level"]
                conversation.sort_order = conv_index + 1
                conversation.is_published = conv_data["is_published"]
                await session.flush()

                existing_lines = {
                    line.line_order: line
                    for line in (
                        await session.execute(
                            select(ConversationLine).where(
                                ConversationLine.conversation_id == conversation.id
                            )
                        )
                    ).scalars()
                }
                for line_index, (speaker, text_en, hint) in enumerate(conv_data["lines"]):
                    line_order = line_index + 1
                    line = existing_lines.get(line_order)
                    if line is None:
                        line = ConversationLine(
                            conversation_id=conversation.id,
                            line_order=line_order,
                        )
                        session.add(line)
                    line.speaker = Speaker(speaker)
                    line.text_en = text_en
                    line.pronunciation_hint = hint
        
        await session.commit()
        print("Database successfully upserted with 18 Topics and 90 Conversations.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing curriculum and progress before seeding (requires guard env var).",
    )
    args = parser.parse_args()
    asyncio.run(seed(reset=args.reset))
