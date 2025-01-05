const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Environment Variables
const PORT = 8080;
const DB_NAME = "bakery";
const DB_USER = "admin";
const DB_PASSWORD = "password";
const DB_HOST = "localhost";
const JWT_SECRET = "laiba_afzal";

const orderStatusEnum = {
  Pending: "Pending",
  Preparing: "Preparing",
  Delivered: "Delivered",
  Rejected: "Rejected",
  OnWay: "OnWay",
};

const userTypeEnum = {
  Admin: "Admin",
  Customer: "Customer",
};

// Database Initialization
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: "mysql",
});

// Models
const User = sequelize.define(
  "User",
  {
    name: { type: DataTypes.STRING, allowNull: true },
    userType: {
      type: DataTypes.ENUM(Object.values(userTypeEnum)),
      defaultValue: userTypeEnum.Admin,
    },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
  },
  { timestamps: true }
);

const Product = sequelize.define(
  "Product",
  {
    name: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.FLOAT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    imageUrl: { type: DataTypes.STRING, allowNull: true },
  },
  { timestamps: true }
);

const Order = sequelize.define(
  "Order",
  {
    customerName: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    totalPrice: { type: DataTypes.FLOAT, allowNull: false },
    address: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM(Object.values(orderStatusEnum)),
      defaultValue: orderStatusEnum.Pending,
    },
  },
  { timestamps: true }
);

Order.belongsToMany(Product, { through: "OrderProducts" });
Product.belongsToMany(Order, { through: "OrderProducts" });

const Contact = sequelize.define(
  "Contact",
  {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
  },
  { timestamps: true }
);

// Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
};

// Routes
// User Routes
app.post("/api/users/register", async (req, res) => {
  const { email, password, name, userType } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      userType,
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/users/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Product Routes
app.post("/api/products", authMiddleware, async (req, res) => {
  const { name, price, description, imageUrl } = req.body;
  try {
    const product = await Product.create({
      name,
      price,
      description,
      imageUrl,
    });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/users", authMiddleware, async (req, res) => {
  const users = await User.findAll();
  res.json(users);
});

app.get("/api/products", async (req, res) => {
  const products = await Product.findAll();
  res.json(products);
});

app.put("/api/products/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, price, description, imageUrl } = req.body;
  try {
    const product = await Product.findByPk(id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    product.name = name;
    product.price = price;
    product.description = description;
    product.imageUrl = imageUrl;
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/products/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findByPk(id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    await product.destroy();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Order Routes
app.post("/api/orders", async (req, res) => {
  const { customerName, email, address, totalPrice, productIds } = req.body;
  try {
    const order = await Order.create({
      customerName,
      email,
      address,
      totalPrice,
      productIds,
    });
    const products = await Product.findAll({ where: { id: productIds } });
    await order.addProducts(products);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders", async (req, res) => {
  const orders = await Order.findAll({ include: Product });
  res.json(orders);
});

app.put("/api/orders/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.status = status;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contact Routes
app.post("/api/contacts", async (req, res) => {
  const { name, email, subject, message } = req.body;
  try {
    const contact = await Contact.create({ name, email, subject, message });
    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/contacts", authMiddleware, async (req, res) => {
  try {
    const contacts = await Contact.findAll({
      order: [["id", "DESC"]], // Order by `id` in descending order
    });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("Database synced");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("Database connection failed:", err));
