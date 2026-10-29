import express from "express";
import crypto from "node:crypto";
import { variants } from "../shared/domain";
import { demoOrigin } from "./config";
type Fixture = { variant: string; wording: string };
const fixtures = new Map<string, Fixture>();
export function demoApp(controlToken: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.post("/__fixtures", (req, res) => {
    if (req.headers["x-tracepilot-control"] !== controlToken)
      return void res.sendStatus(403);
    const id = crypto.randomUUID();
    fixtures.set(id, {
      variant: variants.includes(req.body.variant)
        ? req.body.variant
        : "correct",
      wording: req.body.wording || "standard",
    });
    if (fixtures.size > 500) fixtures.delete(fixtures.keys().next().value!);
    res.json({ session: id });
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  // Deliberately leaves the configured origin. Browser routing must reject this redirect.
  app.get("/outbound", (_req, res) =>
    res.redirect("http://tracepilot-blocked.invalid/"),
  );
  app.get("*", (req, res) => {
    const cookie = req.headers.cookie?.match(/(?:^|; )tp_session=([^;]+)/)?.[1];
    const fixture = fixtures.get(cookie || "") || {
      variant: "correct",
      wording: "standard",
    };
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    res.type("html").send(html(fixture));
  });
  return app;
}
function html(f: Fixture) {
  // Variant effects are applied server-side; no bug flag, variant name or evaluator data is shipped to the page.
  const expiredRate = f.variant === "expired-coupon" ? "discount=1280;" : "";
  const quantityUpdate =
    f.variant === "stale-quantity" ? "" : "subtotal=quantity*6400;";
  const removeUpdate = f.variant === "sticky-discount" ? "" : "discount=0;";
  const nameValidation =
    f.variant === "missing-required"
      ? ""
      : `if(!data.get('name').trim()){document.querySelector('[data-testid="name-error"]').textContent='Full name is required.';return;}`;
  const alternate = f.wording === "alternate";
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldwork Supply</title><style>
 *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#233227;margin:0;background:#f8f8f3}header{height:82px;border-bottom:1px solid #dedfd5;background:white;display:flex;align-items:center;justify-content:space-between;padding:0 7%}.brand{font-size:23px;font-weight:800;letter-spacing:-1px}button,a{cursor:pointer}button{font:inherit;border:0;border-radius:6px;padding:13px 20px;background:#263f2d;color:white}nav{display:flex;gap:12px}nav button{background:transparent;color:#304233}main{max-width:1050px;margin:auto;padding:45px 32px}.eyebrow{font-size:11px;letter-spacing:2px;color:#687b61}h1{font-size:36px;letter-spacing:-1px;margin:14px 0}p{color:#647065;line-height:1.6}.grid{display:grid;grid-template-columns:1.2fr 1fr;gap:44px;margin-top:35px}.product{background:#e5e9d9;min-height:280px;display:grid;place-items:center;border-radius:8px}.bag{font-size:130px}.card{background:white;border:1px solid #e0e4d8;padding:28px;border-radius:9px}.row{display:flex;align-items:center;justify-content:space-between;margin:20px 0;gap:20px}.total{border-top:1px solid #ddd;padding-top:20px;font-size:21px;font-weight:700}label{display:block;font-size:13px;margin-top:18px}input{font:inherit;border:1px solid #bdc8b6;border-radius:5px;padding:12px;width:100%;margin:8px 0}input[type=number]{width:85px}small{color:#6e7966}.message{color:#a23926;min-height:22px;font-size:14px}.secondary{background:#eef0e7;color:#31462c}.full{width:100%}.line{height:1px;background:#e2e4da;margin:20px 0}.tag{background:#eaf0df;color:#486531;padding:6px 9px;font-size:11px;border-radius:4px}.hidden{display:none}footer{max-width:985px;margin:45px auto;padding:22px 0;border-top:1px solid #ddd;font-size:12px;color:#7d8775}h2{font-size:22px}@media(max-width:650px){.grid{grid-template-columns:1fr}header{padding:0 20px}main{padding:24px}}
 </style></head><body><header><div class="brand">fieldwork<span style="color:#7d965d">.</span></div><nav><button data-testid="shop-link" onclick="view='shop';render()">Shop</button><button data-testid="login-link" onclick="view='login';render()">Sign in</button><button data-testid="cart-link" onclick="view='cart';render()">${alternate ? "Your bag" : "Cart"} <span data-testid="cart-count">1</span></button></nav></header><main id="app"></main><footer>FIELDWORK SUPPLY · Thoughtfully made for the everyday. &nbsp; Local test store · No real payments.</footer><script>
 let view='shop',quantity=1,subtotal=6400,discount=0,coupon='',message='',signedIn=false;
 const money=n=>'$'+(n/100).toFixed(2),total=()=>subtotal+800-discount;
 function summary(){return '<div class="row"><span>Subtotal</span><span data-testid="cart-subtotal">'+money(subtotal)+'</span></div><div class="row"><span>Shipping</span><span>$8.00</span></div><div class="row"><span>Discount</span><span data-testid="discount">−'+money(discount)+'</span></div><div class="row total"><span>Total</span><span data-testid="cart-total">'+money(total())+'</span></div>'}
 function render(){document.querySelector('[data-testid="cart-count"]').textContent=quantity;let content='';
 if(view==='shop')content='<div class="eyebrow">THE EVERYDAY COLLECTION</div><h1>Good things. Built to go.</h1><p>Considered essentials for wherever the day takes you.</p><div class="grid"><div class="product"><div class="bag">🎒</div></div><div style="padding:24px 0"><span class="tag">BESTSELLER</span><h2>Everyday Backpack</h2><p>Water-resistant canvas. A place for everything.<br>Made for the long way home.</p><h2>$64.00</h2><button data-testid="product-details" onclick="view=\\'details\\';render()">View details</button> <button class="secondary" data-testid="add-to-cart" onclick="view=\\'cart\\';render()">View in cart</button><p><small>One backpack is already in your test cart.</small></p></div></div>';
 if(view==='details')content='<div class="eyebrow">FIELDWORK / EVERYDAY BACKPACK</div><h1>Everyday Backpack</h1><div class="grid"><div class="product"><div class="bag">🎒</div></div><div class="card"><h2>$64.00</h2><p>18L recycled canvas, padded laptop sleeve, adjustable straps.</p><button data-testid="add-to-cart" onclick="quantity++;subtotal=quantity*6400;view=\\'cart\\';render()">Add to cart</button></div></div>';
 if(view==='cart')content='<div class="eyebrow">A LITTLE LESS, BUT BETTER</div><h1>${alternate ? "Your everyday carry" : "Your cart"}</h1><div class="grid"><div class="card"><div class="row"><span style="font-size:55px">🎒</span><div><strong>Everyday Backpack</strong><p>Olive / One size</p><span>$64.00 each</span></div></div><div class="line"></div><label for="quantity">Quantity</label><input id="quantity" data-testid="quantity" type="number" min="1" max="9" value="'+quantity+'" onchange="updateQuantity(this.value)"><p><small>Secure checkout · Free returns within 30 days</small></p></div><div class="card"><h2>Order summary</h2>'+summary()+'<div class="line"></div><label for="coupon">Coupon code</label><div style="display:flex;gap:8px;align-items:center"><input id="coupon" data-testid="coupon-input" placeholder="Enter code" value="'+coupon+'"><button data-testid="apply-coupon" onclick="applyCoupon()">${alternate ? "Use code" : "Apply"}</button></div><div role="status" class="message" data-testid="coupon-message">'+message+'</div>'+(coupon==='WELCOME10'?'<button class="secondary" data-testid="remove-coupon" onclick="removeCoupon()">Remove coupon</button>':'')+'<div class="line"></div><button class="full" data-testid="checkout-link" onclick="view=\\'checkout\\';render()">Continue to checkout →</button></div></div>';
 if(view==='checkout')content='<div class="eyebrow">ONE LAST THING</div><h1>Checkout</h1><div class="grid"><form class="card" novalidate onsubmit="placeOrder(event)"><h2>Shipping details</h2><label for="name">Full name</label><input id="name" name="name" data-testid="checkout-name" autocomplete="off"><div class="message" role="alert" data-testid="name-error"></div><label for="email">Email</label><input id="email" name="email" type="email" data-testid="checkout-email"><label for="address">Address</label><input id="address" name="address" data-testid="checkout-address"><div class="message" data-testid="checkout-error"></div><button class="full" data-testid="place-order" type="submit">Place test order</button><p><small>This is a mock order. No payment is collected.</small></p></form><div class="card"><h2>Your order</h2>'+summary()+'</div></div>';
 if(view==='confirmed')content='<div class="card" data-testid="order-confirmation"><span class="tag">ORDER RECEIVED</span><h1>Thank you for your order.</h1><p>Your test order is confirmed. No payment was collected.</p></div>';
 if(view==='login')content='<div class="eyebrow">WELCOME BACK</div><h1>Sign in</h1><form class="card" style="max-width:470px" onsubmit="login(event)"><label for="login-email">Email</label><input id="login-email" data-testid="login-email" name="email" type="email" required><label for="login-password">Password</label><input id="login-password" data-testid="login-password" name="password" type="password" required><button data-testid="login-submit" type="submit">Sign in</button><p data-testid="login-message" role="status"></p></form>';
 document.getElementById('app').innerHTML=content;}
 function updateQuantity(value){quantity=Math.max(1,Math.min(9,Number(value)||1));${quantityUpdate}render();}
 function applyCoupon(){coupon=document.querySelector('[data-testid="coupon-input"]').value.trim();if(coupon==='EXPIRED20'){message='This coupon has expired.';${expiredRate}}else if(coupon==='WELCOME10'){discount=Math.round(subtotal*.1);message='Coupon applied.';}else{message='Coupon not found.';}render();}
 function removeCoupon(){coupon='';message='Coupon removed.';${removeUpdate}render();}
 function placeOrder(event){event.preventDefault();const data=new FormData(event.target);${nameValidation}if(!data.get('email').includes('@')||!data.get('address').trim()){document.querySelector('[data-testid="checkout-error"]').textContent='Valid email and address are required.';return;}view='confirmed';render();}
 async function login(event){event.preventDefault();const data=new FormData(event.target);const response=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')})});document.querySelector('[data-testid="login-message"]').textContent=response.ok?'Signed in successfully.':'Invalid credentials.';document.querySelector('[data-testid="login-password"]').value='';}
 render();</script></body></html>`;
}
export function mountDemoLogin(
  app: express.Express,
  email: string,
  password: string,
) {
  app.post("/login", (req, res) => {
    res.sendStatus(
      req.body.email === email && req.body.password === password ? 200 : 401,
    );
  });
}
export { demoOrigin };
