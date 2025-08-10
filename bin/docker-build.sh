DOCKER_IMAGE_NAME="maratms-prod"
DOCKER_CONTAINER_NAME="maratms-prod1"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# API_ENDPOINT="http://localhost"

docker stop $DOCKER_CONTAINER_NAME
docker rm $DOCKER_CONTAINER_NAME
docker rmi $DOCKER_IMAGE_NAME
#docker build -t $DOCKER_IMAGE_NAME \
#  --build-arg API_ENDPOINT="$API_ENDPOINT" \
#  -f $SCRIPT_DIR/../.docker/prod/front/Dockerfile $SCRIPT_DIR/../

docker build -t $DOCKER_IMAGE_NAME \
  -f $SCRIPT_DIR/../.docker/prod/front/Dockerfile $SCRIPT_DIR/../
