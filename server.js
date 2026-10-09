const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "secret-key-default";

// ==========================================
// MIDDLEWARE XÁC THỰC JWT & PHÂN QUYỀN
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Không tìm thấy Token xác thực!" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
    }
    req.user = user;
    next();
  });
};

// Middleware kiểm tra quyền Admin
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res
      .status(403)
      .json({ message: "Quyền truy cập bị từ chối! Yêu cầu quyền Admin." });
  }
};

// ==========================================
// CHẶNG 3: API AUTHENTICATION (ĐĂNG KÝ, ĐĂNG NHẬP)
// ==========================================

// 1. Đăng ký tài khoản
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, fullname, password } = req.body;

    if (!username || !fullname || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng điền đầy đủ thông tin!" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Tên đăng nhập đã tồn tại!" });
    }

    const customerRole = await prisma.role.findUnique({
      where: { rolename: "customer" },
    });
    const bronzeMembership = await prisma.membership.findFirst({
      where: { mname: "Bronze" },
    });

    if (!customerRole || !bronzeMembership) {
      return res
        .status(500)
        .json({ message: "Chưa seed dữ liệu Role hoặc Membership!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        fullname,
        password: hashedPassword,
        roleid: customerRole.roleid,
        mid: bronzeMembership.mid,
      },
    });

    res.status(201).json({
      message: "Đăng ký tài khoản thành công!",
      user: {
        uid: newUser.uid,
        username: newUser.username,
        fullname: newUser.fullname,
      },
    });
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    res
      .status(500)
      .json({ message: "Lỗi máy chủ nội bộ", error: error.message });
  }
});

// 2. Đăng nhập
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Tên đăng nhập hoặc mật khẩu không đúng!" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(400)
        .json({ message: "Tên đăng nhập hoặc mật khẩu không đúng!" });
    }

    const token = jwt.sign(
      { uid: user.uid, username: user.username, role: user.role.rolename },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" },
    );

    res.json({
      message: "Đăng nhập thành công!",
      token,
      user: {
        uid: user.uid,
        username: user.username,
        fullname: user.fullname,
        role: user.role.rolename,
      },
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    res
      .status(500)
      .json({ message: "Lỗi máy chủ nội bộ", error: error.message });
  }
});

// 3. Lấy thông tin cá nhân (Profile)
app.get("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      select: {
        uid: true,
        username: true,
        fullname: true,
        role: true,
        membership: true,
      },
    });
    res.json({ message: "Lấy thông tin cá nhân thành công!", user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi máy chủ nội bộ", error: error.message });
  }
});

// ==========================================
// CHẶNG 4: CRUD PRODUCT
// ==========================================

// Lấy danh sách tất cả sản phẩm
app.get("/api/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi lấy danh sách sản phẩm", error: error.message });
  }
});

// Lấy thông tin chi tiết 1 sản phẩm
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { pid: parseInt(req.params.id) },
    });
    if (!product)
      return res.status(404).json({ message: "Không tìm thấy sản phẩm!" });
    res.json(product);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi lấy chi tiết sản phẩm", error: error.message });
  }
});

// Tạo sản phẩm mới (Yêu cầu đăng nhập + Admin)
app.post(
  "/api/products",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      const { pname, price, quantity } = req.body;
      const newProduct = await prisma.product.create({
        data: {
          pname,
          price: parseFloat(price),
          quantity: parseInt(quantity),
        },
      });
      res
        .status(201)
        .json({ message: "Tạo sản phẩm thành công!", product: newProduct });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Lỗi tạo sản phẩm", error: error.message });
    }
  },
);

// Cập nhật sản phẩm (Yêu cầu đăng nhập + Admin)
app.put(
  "/api/products/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      const { pname, price, quantity } = req.body;
      const updatedProduct = await prisma.product.update({
        where: { pid: parseInt(req.params.id) },
        data: {
          pname,
          price: price ? parseFloat(price) : undefined,
          quantity: quantity !== undefined ? parseInt(quantity) : undefined,
        },
      });
      res.json({
        message: "Cập nhật sản phẩm thành công!",
        product: updatedProduct,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Lỗi cập nhật sản phẩm", error: error.message });
    }
  },
);

// Xóa sản phẩm (Yêu cầu đăng nhập + Admin)
app.delete(
  "/api/products/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      await prisma.product.delete({
        where: { pid: parseInt(req.params.id) },
      });
      res.json({ message: "Xóa sản phẩm thành công!" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Lỗi xóa sản phẩm", error: error.message });
    }
  },
);

// ==========================================
// CHẶNG 4: TẠO ORDER KÈM ORDERDETAIL VÀ SHIPMENT (TRANSACTION)
// ==========================================

// Đặt hàng (User đã đăng nhập)
app.post("/api/orders", authenticateToken, async (req, res) => {
  try {
    const { items } = req.body; // items: [{ pid: 1, qty: 2 }, ...]

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ message: "Đơn hàng phải chứa ít nhất 1 sản phẩm!" });
    }

    // Thực hiện Transaction để đảm bảo tính toàn vẹn dữ liệu
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tạo Order mới
      const order = await tx.order.create({
        data: {
          uid: req.user.uid,
        },
      });

      // 2. Tạo các OrderDetail và trừ số lượng sản phẩm trong kho
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { pid: item.pid },
        });

        if (!product || product.quantity < item.qty) {
          throw new Error(
            `Sản phẩm ID ${item.pid} không đủ số lượng trong kho!`,
          );
        }

        // Tạo chi tiết đơn hàng
        await tx.orderDetail.create({
          data: {
            oid: order.oid,
            pid: item.pid,
            qty: item.qty,
            unit_price: product.price,
          },
        });

        // Trừ bớt tồn kho
        await tx.product.update({
          where: { pid: item.pid },
          data: { quantity: product.quantity - item.qty },
        });
      }

      // 3. Tự động tạo bản ghi Shipment với trạng thái "PENDING"
      const shipment = await tx.shipment.create({
        data: {
          oid: order.oid,
          status: "PENDING",
        },
      });

      return { order, shipment };
    });

    res.status(201).json({
      message: "Tạo đơn hàng thành công!",
      orderId: result.order.oid,
      shipmentId: result.shipment.shipid,
      shipmentStatus: result.shipment.status,
    });
  } catch (error) {
    console.error("Lỗi tạo đơn hàng:", error);
    res.status(400).json({ message: error.message || "Lỗi khi tạo đơn hàng!" });
  }
});

// Xem danh sách đơn hàng của người dùng hiện tại
app.get("/api/orders/my-orders", authenticateToken, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { uid: req.user.uid },
      include: {
        orderDetails: {
          include: { product: true },
        },
        shipments: true,
      },
    });
    res.json(orders);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi lấy danh sách đơn hàng", error: error.message });
  }
});

// ==========================================
// CHẶNG 5: HEALTH CHECK
// ==========================================
app.get("/health", async (req, res) => {
  try {
    // Kiểm tra kết nối tới Database
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "UP",
      database: "CONNECTED",
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({
      status: "DOWN",
      database: "DISCONNECTED",
      error: error.message,
    });
  }
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
