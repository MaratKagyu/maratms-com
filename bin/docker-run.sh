DOCKER_IMAGE_NAME="maratms-prod"
DOCKER_CONTAINER_NAME="maratms-prod1"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

docker stop $DOCKER_CONTAINER_NAME
docker rm $DOCKER_CONTAINER_NAME
docker run -p 3000:3000 --env-file $SCRIPT_DIR/../.env --name $DOCKER_CONTAINER_NAME $DOCKER_IMAGE_NAME
