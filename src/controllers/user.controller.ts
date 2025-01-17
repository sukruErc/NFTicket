import httpStatus from "http-status";
import { ApiError, catchAsync, pick } from "../utils";
import { userService } from "../services";

const createUser = catchAsync(async (req, res) => {
  const { email, password, name, phone, birthday, role, nameForNFT, image } =
    req.body;
  const data = await userService.createUser(
    email,
    password,
    name,
    phone,
    birthday,
    role,
    image,
  );
  res.status(httpStatus.CREATED).send(data);
});

const createMetamaskUser = catchAsync(async (req, res) => {
  const { email, password, wallet, name, birthday, role, nameForNFT, image } =
    req.body;
  const data = await userService.createMetamaskUser(
    email,
    password,
    wallet,
    name,
    birthday,
    role,
    nameForNFT,
    image,
  );
  res.status(httpStatus.CREATED).send(data);
});

const createGoogleUser = catchAsync(async (req, res) => {
  const { email, picture, name, role, nameForNFT, image } = req.body;
  const data = await userService.createGoogleUser(
    email,
    picture,
    name,
    role,
    nameForNFT,
    image,
  );
  res.status(httpStatus.CREATED).send(data);
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const token = await userService.login(email, password);
  res.send({ token });
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["name", "role"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  res.send(user);
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(user);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

const verify = catchAsync(async (req, res) => {
  const response = await userService.verify(req.body.code, req.body.userId);
  res.send(response);
});

const requestPasswordReset = catchAsync(async (req, res) => {
  const response = await userService.requestPasswordReset(req.body.email);
  res.send(response);
});

const resetPassword = catchAsync(async (req, res) => {
  const response = await userService.resetPassword(
    req.body.email,
    req.body.token,
    req.body.newPassword,
  );
  res.send(response);
});

const getMne = catchAsync(async (req, res) => {
  const { userId } = req.query;
  const response = await userService.getMne(userId as string);
  res.send(response);
});

export default {
  createUser,
  createMetamaskUser,
  createGoogleUser,
  login,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getMne,
  verify,
  requestPasswordReset,
  resetPassword,
};
