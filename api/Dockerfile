# ---- build stage ----
FROM golang:1.22-alpine AS build
WORKDIR /src

# Cache deps first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Static, CGO-free binary.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---- runtime stage ----
FROM alpine:3.20
# wget is used by the compose healthcheck; ca-certificates for outbound TLS.
RUN apk add --no-cache wget ca-certificates

WORKDIR /app
COPY --from=build /out/server /app/server
RUN mkdir -p /app/data/sessions

EXPOSE 8000
CMD ["/app/server"]
