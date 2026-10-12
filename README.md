# Cờ Tướng Đấu Máy

Game cờ tướng chơi với máy, viết bằng React + TypeScript (Vite). Máy dùng **Pikafish**, engine cờ tướng mạnh nhất hiện nay (NNUE, nhánh từ Stockfish). Pikafish lo cả việc đánh cờ, gợi ý nước đi và phân tích sau ván.

- **Trước ván:** chọn quân Đỏ/Đen/ngẫu nhiên, 5 mức độ khó, 6 kiểu thời gian (có cộng giây mỗi nước), mặt quân chữ Hán hoặc chữ Việt.
- **Trong ván:** gợi ý nước đi (mũi tên trên bàn cờ), đi lại, đầu hàng, đồng hồ hai bên. Luật được áp dụng: chiếu bí, hết nước (thua), cấm lộ mặt tướng, chiếu mãi thì bên chiếu bị xử thua, lặp lại 3 lần là hòa, 60 nước không ăn quân là hòa.
- **Sau ván:** phân tích từng nước, chấm điểm 0–100, phân loại (Tốt nhất, Rất tốt, Tốt, Thiếu chính xác, Sai lầm, Sai lầm nghiêm trọng, Nước bắt buộc), độ chính xác mỗi bên, biểu đồ ưu thế, giải thích *vì sao* và đưa ra nước tốt nhất kèm diễn biến.

## Chạy thử

Cần Node.js 18 trở lên.

```bash
npm install
npm run setup:engine   # tải Pikafish + file mạng NNUE (~55 MB) vào server/engine/
```

**Khi phát triển** (2 terminal):

```bash
npm run server         # server Pikafish ở http://127.0.0.1:8787
npm run dev            # giao diện ở http://localhost:5173 (tự chuyển /api sang server)
```

**Chạy bản build** (1 tiến trình, server phục vụ luôn giao diện):

```bash
npm run build
npm start              # mở http://127.0.0.1:8787
```

Nếu server chưa chạy hoặc chưa có Pikafish, giao diện tự dùng **engine tích hợp** (viết bằng JS, chạy trong Web Worker), nên game vẫn chơi được, chỉ yếu hơn. Ở màn hình "Ván mới" có thể chọn engine và xem trạng thái kết nối.

## Kiến trúc

```
Trình duyệt (React)                               Node server              Pikafish
┌──────────────────────────────┐   HTTP /api   ┌──────────────────┐  UCI  ┌──────────┐
│ components/  (giao diện)     │ ────────────▶ │ server/index.mjs │ ────▶ │ pikafish │
│ game/controller.ts (luật,    │               │ hàng đợi tìm kiếm │ ◀──── │ + .nnue  │
│   ván cờ, đồng hồ, review)   │               └──────────────────┘       └──────────┘
│ engine/pikafishBackend.ts ───┘
│ engine/builtinBackend.ts → Web Worker (engine.ts)   ← dự phòng khi không có server
└──────────────────────────────┘
```

| Thư mục / file | Vai trò |
|---|---|
| `src/engine/engine.ts` | Luật cờ, sinh nước đi, ký hiệu tiếng Việt (`P2-5`, `M8.7`, `X1/2`), chuyển đổi tọa độ UCI, engine tích hợp (alpha-beta) |
| `src/engine/backend.ts` | Giao diện chung `EngineBackend` cho cả hai engine |
| `src/engine/pikafishBackend.ts` | Gọi server; đổi điểm `mate N` của Pikafish sang thang điểm nội bộ |
| `src/game/controller.ts` | Toàn bộ logic ván đấu, độc lập với React (`useSyncExternalStore`) |
| `src/game/review.ts` | Chấm điểm, phân loại và viết lời giải thích cho từng nước |
| `src/game/constants.ts` | Mức độ khó, kiểu thời gian, loại nước đi |
| `server/index.mjs` | Chạy Pikafish, API `/api/health`, `/api/search`, `/api/newgame`, phục vụ `dist/` |
| `scripts/setup-engine.mjs` | Tải bản Pikafish chính thức mới nhất từ GitHub cho đúng hệ điều hành |

### Độ khó với Pikafish

Pikafish không có tùy chọn hạ sức mạnh (không có `Skill Level` hay `UCI_Elo`). Vì vậy các mức thấp tìm nông với `MultiPV`, rồi chọn ngẫu nhiên trong các phương án kém nước tốt nhất không quá một ngưỡng điểm. Phương án càng tốt thì càng hay được chọn. Chỉnh trong `src/game/constants.ts`:

| Mức | Pikafish | Engine tích hợp |
|---|---|---|
| Nhập môn | depth 1, MultiPV 8, lệch ≤ 300 | depth 1, nhiễu ±220 |
| Dễ | depth 3, MultiPV 5, lệch ≤ 150 | depth 2, nhiễu ±90 |
| Trung bình | depth 6, MultiPV 3, lệch ≤ 50 | depth 4, nhiễu ±20 |
| Khó | 1 giây/nước | ~2 giây/nước |
| Đại kiện tướng | 4 giây/nước | ~5 giây/nước |

Khi có đồng hồ, thời gian tính bị giới hạn theo thời gian còn lại.

### Cách chấm điểm

Với mỗi thế cờ, engine tìm nước tốt nhất và điểm số. Điểm của nước đã đi lấy từ thế cờ ngay sau nó. Hai điểm này được đổi sang xác suất thắng: `1 / (1 + e^(-cp/300))`. Phần chênh lệch quyết định loại nước: dưới 2% là Rất tốt, 6% là Tốt, 12% là Thiếu chính xác, 22% là Sai lầm, từ 22% trở lên là Sai lầm nghiêm trọng. Điểm mỗi nước bằng `100·e^(-6·chênh lệch)`. Độ chính xác là điểm trung bình các nước của mỗi bên.

Lời giải thích dựa trên các sự kiện cụ thể: để hở quân và bị ăn, bỏ lỡ cơ hội ăn quân, bỏ lỡ hoặc để bị chiếu bí, đổi quân bị thiệt. Kèm theo là diễn biến mà engine dự tính.

## Biến môi trường của server

| Biến | Mặc định | |
|---|---|---|
| `PORT` | `8787` | |
| `HOST` | `127.0.0.1` | Đặt `0.0.0.0` nếu muốn máy khác trong mạng truy cập |
| `PIKAFISH_PATH` | `server/engine/pikafish` | Dùng bản Pikafish tự build |
| `PIKAFISH_THREADS` | `1` | Tăng để máy mạnh hơn khi CPU nhiều nhân |
| `PIKAFISH_HASH` | `128` | MB |

Frontend gọi `/api` cùng domain. Nếu server ở chỗ khác, build với `VITE_API_BASE=https://…/api npm run build`.

## Lệnh khác

```bash
npm test               # test luật đi quân (perft), ký hiệu, chấm điểm
npm run typecheck
```

## Giấy phép

Pikafish dùng giấy phép GPL v3. File mạng `pikafish.nnue` có giấy phép riêng: **không dùng cho mục đích thương mại khi chưa được phép** (xem `server/engine/NNUE-License.md` sau khi chạy `setup:engine`). Script chỉ tải từ trang phát hành chính thức trên GitHub; Pikafish không được đóng gói sẵn trong mã nguồn.
