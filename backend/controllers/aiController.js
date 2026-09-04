'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const asyncHandler = require('../utils/asyncHandler');

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free';

// Internal tools
async function searchProducts({ query, maxPrice }) {
    const filter = { isActive: true };
    if (query) {
        const rx = new RegExp(query, 'i');
        filter.$or = [{ name: rx }, { description: rx }, { brand: rx }, { category: rx }];
    }
    if (maxPrice) filter.price = { $lte: Number(maxPrice) };
    const items = await Product.find(filter).limit(5).select('name price stock category brand');
    if (items.length === 0) return 'No products found matching the query.';
    return items.map(p => `${p.name} (ID: ${p._id}) - ₹${p.price} - Stock: ${p.stock}`).join('\n');
}

async function addToCartInternal(userId, productId, quantity) {
    if (!mongoose.isValidObjectId(productId)) return "Error: Invalid product ID";
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) return "Error: Product not found";
    if (product.stock <= 0) return "Error: Product is out of stock";

    const cart = await Cart.findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const existing = cart.items.find((line) => String(line.product) === String(productId));
    const currentQty = existing ? existing.quantity : 0;
    if (currentQty + quantity > product.stock) {
        return `Error: Only ${product.stock} units in stock. You have ${currentQty} in cart.`;
    }

    if (existing) existing.quantity += quantity;
    else cart.items.push({ product: productId, quantity });

    await cart.save();
    return `Success: Added ${quantity} of ${product.name} to cart. Use the chat to remind the user to check their cart!`;
}

const tools = [
    {
        type: "function",
        function: {
            name: "search_catalog",
            description: "Search the store catalog for products. Returns a list of products with their exact ID, name, price, and stock.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search term e.g. 'smartphone', 'headphones'" },
                    maxPrice: { type: "number", description: "Maximum price in INR" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "add_to_cart",
            description: "Add a specific product to the user's shopping cart. You must use the exact Product ID returned by search_catalog.",
            parameters: {
                type: "object",
                properties: {
                    productId: { type: "string", description: "The exact MongoDB ObjectId of the product" },
                    quantity: { type: "number", description: "Number of units to add (default 1)" }
                },
                required: ["productId", "quantity"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "go_to_checkout",
            description: "Redirect the user's browser automatically to the checkout page. Call this ONLY when the user explicitly asks to pay, checkout, or complete their order.",
            parameters: { type: "object", properties: {} }
        }
    }
];

const SYSTEM_PROMPT = `You are an AI Personal Shopper for NovaMart (an e-commerce store).
Your goal is to help the user find products and add them to their shopping cart.
Strictly bound your answers to e-commerce and store operations. Do not answer questions outside of shopping.
When the user wants to buy something, ALWAYS use the 'search_catalog' tool first to find real products and their current IDs and prices.
DO NOT invent products or prices. Only recommend what search_catalog returns.
When adding to cart, ALWAYS use the exact Product ID returned by the search tool.
If the user asks to checkout, pay, or proceed to payment, ALWAYS call the 'go_to_checkout' tool immediately!
Be polite, concise, and persuasive. Format prices in ₹.`;

exports.chatWithAI = asyncHandler(async (req, res) => {
    if (!API_KEY) {
        return res.status(503).json({ success: false, message: 'AI provider is not configured properly.' });
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ success: false, message: 'messages array is required' });
    }

    // Prepend system prompt
    const conversation = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
    ];

    let isToolCall = true;
    let finalResponse = null;

    let loops = 0;
    while (isToolCall && loops < 3) {
        loops++;
        let response;
        try {
            response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:5000',
                    'X-Title': 'NovaMart AI Shopper'
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: conversation,
                    tools: tools,
                    tool_choice: "auto"
                })
            });
        } catch (e) {
            console.error('Fetch Error:', e);
            return res.status(502).json({ success: false, message: 'Failed to contact AI provider' });
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter Error:', errorText);
            return res.status(502).json({ success: false, message: 'AI provider error' });
        }

        const data = await response.json();
        const assistantMsg = data.choices[0].message;

        // Some providers return null content, normalize it to empty string if needed
        if (assistantMsg.content === null) assistantMsg.content = "";

        conversation.push(assistantMsg);

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            for (const call of assistantMsg.tool_calls) {
                let result = "";
                try {
                    const args = JSON.parse(call.function.arguments);
                    if (call.function.name === 'search_catalog') {
                        result = await searchProducts(args);
                    } else if (call.function.name === 'add_to_cart') {
                        result = await addToCartInternal(req.user._id, args.productId, args.quantity || 1);
                    } else if (call.function.name === 'go_to_checkout') {
                        result = "SUCCESS: The user is being redirected to the checkout page right now.";
                        res.locals.redirectCheckout = true;
                    }
                } catch (e) {
                    result = "Error executing tool: " + e.message;
                }
                conversation.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result });
            }
        } else {
            isToolCall = false;
            finalResponse = { role: assistantMsg.role, content: assistantMsg.content };
        }
    }

    res.json({
        success: true,
        data: finalResponse,
        redirect: res.locals.redirectCheckout ? 'checkout' : null
    });
});
