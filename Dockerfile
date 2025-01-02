# Build stage
FROM golang:1.21-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go mod and sum files
COPY server/go.mod server/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY server/ .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main

# Final stage
FROM alpine:latest

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/main .
# Copy frontend files
COPY --from=builder /app/static ./static

# Set environment variables
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Run the binary
CMD ["./main"]
