# Stirling-PDF on AWS - Terraform module (single-module starting point).
# Production users typically split into modules/{vpc,ecs,rds,elasticache,alb}; this shape
# is meant as a copy-and-fill-in template.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ----- inputs -----
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type    = string
  default = "stirling"
}

variable "app_image" {
  type    = string
  # Never use :latest in production - breaks reproducible deploys and rollback.
  default = "stirlingtools/stirling-pdf:2.11.0"
}

variable "engine_image" {
  type    = string
  default = "stirlingtools/stirling-pdf-ai-engine:2.11.0"
}

variable "app_count" {
  type    = number
  default = 2
}

variable "app_cpu" {
  type    = number
  default = 1024
}

variable "app_memory" {
  type    = number
  default = 4096
}

variable "engine_count" {
  type    = number
  default = 1
}

variable "enable_ai_engine" {
  type    = bool
  default = false
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "engine_shared_secret" {
  type      = string
  sensitive = true
}

variable "valkey_auth_token" {
  # ElastiCache AUTH token (16-128 chars). Generate: openssl rand -hex 32
  type      = string
  sensitive = true
  validation {
    condition     = length(var.valkey_auth_token) >= 16 && length(var.valkey_auth_token) <= 128
    error_message = "valkey_auth_token must be between 16 and 128 characters."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

# ----- networking (slim VPC, two AZs) -----
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "${var.name}-vpc"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_subnet" "a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 1)
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true
}

resource "aws_subnet" "b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 2)
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "a" {
  subnet_id      = aws_subnet.a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "b" {
  subnet_id      = aws_subnet.b.id
  route_table_id = aws_route_table.public.id
}

# ----- security groups -----
resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "Stirling app tasks"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "alb_to_app" {
  type                     = "ingress"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "app_to_app" {
  type                     = "ingress"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.app.id
}

resource "aws_security_group" "valkey" {
  name        = "${var.name}-valkey"
  description = "Valkey ElastiCache"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

resource "aws_security_group" "engine_lb" {
  count       = var.enable_ai_engine ? 1 : 0
  name        = "${var.name}-engine-lb"
  description = "Internal ALB in front of engine tier - app tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5001
    to_port         = 5001
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "engine" {
  count       = var.enable_ai_engine ? 1 : 0
  name        = "${var.name}-engine"
  description = "AI engine tasks - only reachable from the internal engine LB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5001
    to_port         = 5001
    protocol        = "tcp"
    security_groups = [aws_security_group.engine_lb[0].id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ----- managed Valkey (ElastiCache for Valkey, GA since 2024) -----
resource "aws_elasticache_subnet_group" "valkey" {
  name       = "${var.name}-valkey"
  subnet_ids = [aws_subnet.a.id, aws_subnet.b.id]
}

resource "aws_elasticache_replication_group" "valkey" {
  replication_group_id       = "${var.name}-valkey"
  description                = "Stirling Valkey"
  engine                     = "valkey"
  engine_version             = "8.0"
  node_type                  = "cache.t4g.small"
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  subnet_group_name          = aws_elasticache_subnet_group.valkey.name
  security_group_ids         = [aws_security_group.valkey.id]
  at_rest_encryption_enabled = true
  # TLS in flight required when auth_token is set (ElastiCache enforces this).
  transit_encryption_enabled = true
  auth_token                 = var.valkey_auth_token
}

# ----- managed Postgres -----
resource "aws_db_subnet_group" "pg" {
  name       = "${var.name}-pg"
  subnet_ids = [aws_subnet.a.id, aws_subnet.b.id]
}

resource "aws_db_instance" "pg" {
  identifier                = "${var.name}-pg"
  engine                    = "postgres"
  engine_version            = "17.2"
  instance_class            = "db.t4g.micro"
  allocated_storage         = 20
  username                  = "stirling"
  password                  = var.db_password
  db_name                   = "stirling"
  db_subnet_group_name      = aws_db_subnet_group.pg.name
  vpc_security_group_ids    = [aws_security_group.db.id]
  storage_encrypted         = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-pg-final"
  backup_retention_period   = 7
}

# ----- secrets -----
resource "aws_secretsmanager_secret" "bundle" {
  name = "${var.name}-secrets"
}

resource "aws_secretsmanager_secret_version" "bundle" {
  secret_id = aws_secretsmanager_secret.bundle.id
  secret_string = jsonencode({
    engineSharedSecret = var.engine_shared_secret
    dbPassword         = var.db_password
    valkeyAuthToken    = var.valkey_auth_token
  })
}

# ----- ECS cluster + IAM -----
resource "aws_ecs_cluster" "main" {
  name = "${var.name}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_iam_role" "exec" {
  name = "${var.name}-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "exec_managed" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "exec_read_secrets" {
  role = aws_iam_role.exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.bundle.arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.name}"
  retention_in_days = 14
}

# ----- ALB + target group + listener (blocks /internal/*) -----
resource "aws_lb" "alb" {
  name               = "${var.name}-alb"
  load_balancer_type = "application"
  subnets            = [aws_subnet.a.id, aws_subnet.b.id]
  security_groups    = [aws_security_group.alb.id]
}

resource "aws_lb_target_group" "app" {
  name        = "${var.name}-app-tg"
  vpc_id      = aws_vpc.main.id
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    path                = "/api/v1/info/status"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }

  # Sticky sessions required - see deploy/aws/README.md.
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener_rule" "block_internal" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  condition {
    path_pattern {
      values = ["/internal/*"]
    }
  }

  action {
    type = "fixed-response"
    fixed_response {
      status_code  = "404"
      content_type = "text/plain"
      message_body = "Not Found"
    }
  }
}

# ----- app task definition + service -----
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name}-app"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.exec.arn

  container_definitions = jsonencode([{
    name      = "stirling"
    image     = var.app_image
    essential = true
    portMappings = [{
      containerPort = 8080
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "app"
      }
    }
    environment = concat([
      { name = "CLUSTER_ENABLED", value = "true" },
      { name = "CLUSTER_BACKPLANE", value = "valkey" },
      # rediss:// = TLS. REDIS_PASSWORD injected separately via secrets below.
      { name = "CLUSTER_VALKEY_URL", value = "rediss://${aws_elasticache_replication_group.valkey.primary_endpoint_address}:6379" },
      { name = "SPRING_DATASOURCE_URL", value = "jdbc:postgresql://${aws_db_instance.pg.endpoint}/stirling" },
      { name = "SPRING_DATASOURCE_USERNAME", value = "stirling" },
      { name = "DOCKER_ENABLE_SECURITY", value = "true" },
      ],
      var.enable_ai_engine ? [
        { name = "AIENGINE_URL", value = "http://${aws_lb.engine[0].dns_name}:5001" },
      ] : []
    )
    secrets = [
      { name = "CLUSTER_ENGINE_SHAREDSECRET", valueFrom = "${aws_secretsmanager_secret.bundle.arn}:engineSharedSecret::" },
      { name = "SPRING_DATASOURCE_PASSWORD", valueFrom = "${aws_secretsmanager_secret.bundle.arn}:dbPassword::" },
      { name = "REDIS_PASSWORD", valueFrom = "${aws_secretsmanager_secret.bundle.arn}:valkeyAuthToken::" },
    ]
  }])
}

resource "aws_ecs_service" "app" {
  name                               = "${var.name}-app"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = var.app_count
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  # Grace period covers Spring Boot warm-up + Valkey handshake (~60-90s total).
  health_check_grace_period_seconds = 120

  network_configuration {
    subnets          = [aws_subnet.a.id, aws_subnet.b.id]
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "stirling"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.http]
}

# ----- autoscaling -----
resource "aws_appautoscaling_target" "app" {
  max_capacity       = 10
  min_capacity       = var.app_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  service_namespace  = aws_appautoscaling_target.app.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 70
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}

# ----- AI engine tier (internal LB + task def + service) -----
resource "aws_lb" "engine" {
  count              = var.enable_ai_engine ? 1 : 0
  name               = "${var.name}-engine-alb"
  internal           = true
  load_balancer_type = "application"
  subnets            = [aws_subnet.a.id, aws_subnet.b.id]
  security_groups    = [aws_security_group.engine_lb[0].id]
}

resource "aws_lb_target_group" "engine" {
  count       = var.enable_ai_engine ? 1 : 0
  name        = "${var.name}-engine-tg"
  vpc_id      = aws_vpc.main.id
  port        = 5001
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }
}

resource "aws_lb_listener" "engine" {
  count             = var.enable_ai_engine ? 1 : 0
  load_balancer_arn = aws_lb.engine[0].arn
  port              = 5001
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.engine[0].arn
  }
}

resource "aws_ecs_task_definition" "engine" {
  count                    = var.enable_ai_engine ? 1 : 0
  family                   = "${var.name}-engine"
  cpu                      = 1024
  memory                   = 2048
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.exec.arn

  container_definitions = jsonencode([{
    name      = "engine"
    image     = var.engine_image
    essential = true
    portMappings = [{
      containerPort = 5001
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "engine"
      }
    }
    secrets = [
      { name = "STIRLING_ENGINE_SHARED_SECRET", valueFrom = "${aws_secretsmanager_secret.bundle.arn}:engineSharedSecret::" },
    ]
  }])
}

resource "aws_ecs_service" "engine" {
  count           = var.enable_ai_engine ? 1 : 0
  name            = "${var.name}-engine"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.engine[0].arn
  desired_count   = var.engine_count
  launch_type     = "FARGATE"
  # Engine model-load warm-up can take 60-90s.
  health_check_grace_period_seconds = 120

  network_configuration {
    subnets          = [aws_subnet.a.id, aws_subnet.b.id]
    security_groups  = [aws_security_group.engine[0].id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.engine[0].arn
    container_name   = "engine"
    container_port   = 5001
  }

  depends_on = [aws_lb_listener.engine]
}

# ----- outputs -----
output "app_url" {
  value = "http://${aws_lb.alb.dns_name}/"
}

output "valkey_endpoint" {
  value = aws_elasticache_replication_group.valkey.primary_endpoint_address
}

output "postgres_endpoint" {
  value = aws_db_instance.pg.endpoint
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}
